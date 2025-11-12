import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const locSelect = document.getElementById('locSelect');
const productsGrid = document.getElementById('productsGrid');
const info = document.getElementById('info');
const naamInput = document.getElementById('naamInput');

let locations = [];
let variants = [];
let products = [];
let stockByLoc = new Map(); // key: `${variant_id}::${location_id}` -> qty

async function init(){
  await loadLocations();
  await loadProductsAndVariants();
  locSelect.addEventListener('change', renderProducts);
  renderProducts();
}

async function loadLocations(){
  const { data, error } = await supabase.from('locations').select('*').order('name');
  if(error){ info.textContent = 'Fout bij laden locaties: ' + error.message; return; }
  locations = data || [];
  locSelect.innerHTML = locations.map(l=>`<option value="${l.id}">${l.name}</option>`).join('');
}

async function loadProductsAndVariants(){
  const { data: prod, error: e1 } = await supabase.from('products').select('*').eq('is_active', true).order('name');
  if(e1){ info.textContent = 'Fout bij laden producten: ' + e1.message; return; }
  products = prod || [];
  const { data: vars, error: e2 } = await supabase.from('product_variants').select('*');
  if(e2){ info.textContent = 'Fout bij laden varianten: ' + e2.message; return; }
  variants = vars || [];
}

async function loadStockForLocation(location_id){
  const { data, error } = await supabase.from('variant_stock').select('*').eq('location_id', location_id);
  if(error){ info.textContent = 'Fout bij laden voorraad: ' + error.message; return; }
  stockByLoc.clear();
  (data||[]).forEach(r=>{
    stockByLoc.set(`${r.variant_id}::${r.location_id}`, r.qty);
  });
}

function sizesForProduct(product_id){
  return variants.filter(v=>v.product_id===product_id).map(v=>v.size);
}
function variantIdFor(product_id, size){
  const v = variants.find(v=>v.product_id===product_id && v.size===size);
  return v ? v.id : null;
}
function qtyOf(variant_id, location_id){
  return stockByLoc.get(`${variant_id}::${location_id}`) ?? 0;
}

async function renderProducts(){
  productsGrid.innerHTML = '';
  const location_id = locSelect.value;
  if(!location_id){ info.textContent='Kies een locatie.'; return; }
  await loadStockForLocation(location_id);
  info.textContent = '';

  products.forEach(p=>{
    const sizes = sizesForProduct(p.id);
    // bereken som per product bij locatie
    let sum = 0;
    sizes.forEach(s=>{
      const vid = variantIdFor(p.id, s);
      sum += qtyOf(vid, location_id);
    });
    const sizesOptions = sizes.map(s=>{
      const vid = variantIdFor(p.id, s);
      const q = qtyOf(vid, location_id);
      const disabled = q<=0 ? 'disabled' : '';
      return `<option value="${s}" ${disabled}>${s} ${q>0?`(voorraad: ${q})`:'(0 – niet beschikbaar)'}</option>`;
    }).join('');

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="row" style="justify-content:space-between">
        <div>
          <div style="font-weight:600">${p.name}</div>
          <div style="color:#6b7280">${p.descnl||''}</div>
          <div class="badge" style="margin-top:6px">Totaal @ locatie: ${sum}</div>
        </div>
        ${p.image?`<img src="${p.image}" alt="${p.name}" style="height:56px;border-radius:8px;border:1px solid #e5e7eb">`:''}
      </div>
      <div class="row" style="margin-top:12px;gap:8px">
        <select data-product="${p.id}" class="sizeSelect">${sizesOptions}</select>
        <button data-product="${p.id}" class="btnBestel">Bestellen</button>
      </div>
    `;
    productsGrid.appendChild(card);
  });

  document.querySelectorAll('.btnBestel').forEach(btn=>{
    btn.addEventListener('click', onBestelClick);
  });
}

async function onBestelClick(e){
  const product_id = e.currentTarget.dataset.product;
  const name = (naamInput.value||'').trim();
  const location_id = locSelect.value;
  if(!name){ alert('Naam is verplicht.'); return; }

  const select = e.currentTarget.parentElement.querySelector('.sizeSelect');
  const size = select.value;
  if(!size){ alert('Kies een maat.'); return; }

  // RPC decrement
  const { data: decData, error: decErr } = await supabase.rpc('decrement_variant_qty_at_location', {
    p_product_id: product_id,
    p_size: size,
    p_location_id: location_id
  });
  if(decErr){ alert('Fout bij bestellen: ' + decErr.message); return; }
  if(!decData){ alert('Niet op voorraad voor deze maat op deze locatie.'); return; }

  // insert order
  const item = { product_id, size, location_id };
  const { error: insErr } = await supabase.from('orders').insert({ name, items: [item] });
  if(insErr){ alert('Bestelling gelukt, maar opslaan order faalde: ' + insErr.message); }
  else { alert('Bestelling verstuurd!'); }

  await renderProducts(); // refresh voorraad
}

init();
