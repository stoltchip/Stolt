import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// UI refs
const loginBox = document.getElementById('loginBox');
const adminPanel = document.getElementById('adminPanel');
const stockBody = document.getElementById('stockBody');
const locSelect = document.getElementById('locSelectAdmin');
const btnLogin = document.getElementById('btnLogin');
const btnLogout = document.getElementById('btnLogout');
const pinInput = document.getElementById('pinInput');

const npNaam = document.getElementById('npNaam');
const npDesc = document.getElementById('npDesc');
const npImage = document.getElementById('npImage');
const npMaten = document.getElementById('npMaten');
const npStart = document.getElementById('npStart');
const btnNieuwProduct = document.getElementById('btnNieuwProduct');

let variants = [];
let products = [];
let locations = [];
let stock = new Map(); // key: `${variant_id}::${location_id}` -> qty

async function sha256Hex(message) {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

function isLogged(){
  return localStorage.getItem('admin_ok')==='1';
}

async function tryAutoLogin(){
  if(isLogged()){
    loginBox.classList.add('hidden');
    adminPanel.classList.remove('hidden');
    await loadAll();
  }
}

btnLogin.addEventListener('click', async ()=>{
  const pin = pinInput.value || '';
  const pinHash = await sha256Hex(pin);
  const { data, error } = await supabase.from('settings').select('admin_pin_sha256').single();
  if(error){ alert('Fout bij controle: '+error.message); return; }
  if(data && data.admin_pin_sha256 === pinHash){
    localStorage.setItem('admin_ok','1');
    loginBox.classList.add('hidden');
    adminPanel.classList.remove('hidden');
    await loadAll();
  }else{
    alert('Ongeldige PIN');
  }
});

btnLogout.addEventListener('click', ()=>{
  localStorage.removeItem('admin_ok');
  location.reload();
});

async function loadAll(){
  await loadLocations();
  await loadProductsAndVariants();
  await renderTable();
  locSelect.addEventListener('change', renderTable);
  btnNieuwProduct.addEventListener('click', onNieuwProduct);
}

async function loadLocations(){
  const { data, error } = await supabase.from('locations').select('*').order('name');
  if(error){ alert('Fout bij laden locaties: '+error.message); return; }
  locations = data||[];
  locSelect.innerHTML = locations.map(l=>`<option value="\${l.id}">\${l.name}</option>`).join('');
}

async function loadProductsAndVariants(){
  const { data: prod, error: e1 } = await supabase.from('products').select('*').eq('is_active', true).order('name');
  if(e1){ alert('Fout bij producten: '+e1.message); return; }
  products = prod||[];
  const { data: vars, error: e2 } = await supabase.from('product_variants').select('*');
  if(e2){ alert('Fout bij varianten: '+e2.message); return; }
  variants = vars||[];
}

async function loadStockForLocation(location_id){
  const { data, error } = await supabase.from('variant_stock').select('*').eq('location_id', location_id);
  if(error){ alert('Fout bij voorraad: '+error.message); return; }
  stock.clear();
  (data||[]).forEach(r=> stock.set(`${r.variant_id}::${r.location_id}`, r.qty));
}

function qtyOf(variant_id, location_id){
  return stock.get(`${variant_id}::${location_id}`) ?? 0;
}

async function renderTable(){
  stockBody.innerHTML='';
  const location_id = locSelect.value;
  if(!location_id) return;
  await loadStockForLocation(location_id);

  // join variants -> product name
  const rows = variants.map(v=>{
    const prod = products.find(p=>p.id===v.product_id);
    const qty = qtyOf(v.id, location_id);
    return {
      variant_id: v.id,
      product_name: prod?prod.name:'—',
      size: v.size,
      qty
    };
  }).sort((a,b)=> a.product_name.localeCompare(b.product_name) || (''+a.size).localeCompare(''+b.size));

  for(const r of rows){
    const tr = document.createElement('tr');
    tr.className = 'tr';
    tr.innerHTML = `
      <td>${r.product_name}</td>
      <td>${r.size}</td>
      <td><strong>${r.qty}</strong></td>
      <td class="controls">
        <button data-id="${r.variant_id}" data-delta="-1">−1</button>
        <button data-id="${r.variant_id}" data-delta="1">+1</button>
      </td>
    `;
    stockBody.appendChild(tr);
  }
  stockBody.querySelectorAll('button').forEach(btn=> btn.addEventListener('click', onAdjustClick));
}

async function onAdjustClick(e){
  const variant_id = e.currentTarget.dataset.id;
  const delta = parseInt(e.currentTarget.dataset.delta,10);
  const location_id = locSelect.value;
  const { data, error } = await supabase.rpc('adjust_variant_qty_at_location', {
    p_variant_id: variant_id,
    p_location_id: location_id,
    p_delta: delta
  });
  if(error){ alert('Fout bij aanpassen: '+error.message); return; }
  await renderTable();
}

async function onNieuwProduct(){
  const name = (npNaam.value||'').trim();
  if(!name){ alert('Naam is verplicht'); return; }
  const desc = (npDesc.value||'').trim();
  const img = (npImage.value||'').trim();
  const maten = (npMaten.value||'').split(',').map(s=>s.trim()).filter(Boolean);
  if(maten.length===0){ alert('Geef minstens één maat'); return; }
  const start = Math.max(0, parseInt(npStart.value||'0',10));
  const location_id = locSelect.value;

  const { data: prod, error: e1 } = await supabase.from('products').insert({ name, descnl: desc, image: img, is_active: true }).select('*').single();
  if(e1){ alert('Fout bij product toevoegen: '+e1.message); return; }

  const toInsert = maten.map(m=>({ product_id: prod.id, size: m }));
  const { data: createdVars, error: e2 } = await supabase.from('product_variants').insert(toInsert).select('*');
  if(e2){ alert('Fout bij varianten: '+e2.message); return; }

  // create stock rows for selected location
  const stockRows = createdVars.map(v=>({ variant_id: v.id, location_id, qty: start }));
  const { error: e3 } = await supabase.from('variant_stock').insert(stockRows);
  if(e3){ alert('Varianten aangemaakt, maar voorraad niet: '+e3.message); }

  alert('Nieuw product toegevoegd.');
  // refresh lists
  await loadProductsAndVariants();
  await renderTable();
  // clear form
  npNaam.value = npDesc.value = npImage.value = npMaten.value = '';
}

tryAutoLogin();
