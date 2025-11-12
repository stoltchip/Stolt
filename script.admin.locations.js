(()=>{
  const $=s=>document.querySelector(s);
  $('#year')?.textContent=new Date().getFullYear();
  const sb = window.supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey);
  let locations=[], products=[], variants=[], currentLoc=null;

  async function sha256(t){const e=new TextEncoder().encode(t),b=await crypto.subtle.digest('SHA-256',e);return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('');}
  async function checkPin(pin){const r=await sb.from('settings').select('admin_pin_sha256').eq('id',1).maybeSingle(); if(r.error||!r.data) return false; return (await sha256(pin))===r.data.admin_pin_sha256;}
  $('#loginBtn').onclick=async()=>{const pin=$('#pinInput').value.trim(); if(!pin) return alert('Voer PIN in.'); if(await checkPin(pin)){ $('#loginSection').classList.add('hidden'); $('#appSection').classList.remove('hidden'); init(); } else { $('#loginMsg').textContent='Onjuiste PIN'; }};

  async function loadLocations(){ const r=await sb.from('locations').select('*').order('name'); locations=r.data||[];
    const sel=$('#adminLocationSelect'); sel.innerHTML=locations.map(l=>`<option value="${l.id}">${l.name}</option>`).join('');
    currentLoc=sel.value||locations[0]?.id||null; sel.onchange=()=>{ currentLoc=sel.value; renderTable(); }; }
  $('#addLocationBtn').onclick=async()=>{ const name=prompt('Nieuwe locatie naam:'); if(!name) return; const {error}=await sb.from('locations').insert({name}); if(error){alert('Fout: '+error.message); return;} await loadLocations(); await renderTable(); };

  async function loadData(){ const p=await sb.from('products').select('*').order('name'); const v=await sb.from('product_variants').select('*'); const s=await sb.from('variant_stock').select('*').eq('location_id',currentLoc||'00000000-0000-0000-0000-000000000000'); products=p.data||[]; variants=v.data||[]; window.__stock=s.data||[]; }
  const qtyFor=(variantId)=> (window.__stock.find(x=>x.variant_id===variantId)?.qty)||0;

  async function renderTable(){ await loadData();
    const rows=[]; products.forEach(p=>{ variants.filter(v=>v.product_id===p.id).forEach(v=>{ const q=qtyFor(v.id);
      rows.push(`<tr data-vid="${v.id}"><td>${p.name||''}</td><td>${v.size}</td><td><strong>${q}</strong></td><td><button class="btn" data-delta="1">+1</button> <button class="btn" data-delta="-1">−1</button></td></tr>`); }); });
    document.getElementById('inventoryTableWrap').innerHTML = `<div class="section" style="padding:0"><table class="table"><thead><tr><th>Product</th><th>Maat</th><th>Voorraad @ ${ (locations.find(l=>l.id===currentLoc)||{}).name || 'locatie' }</th><th>Acties</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  }

  document.getElementById('inventoryTableWrap').addEventListener('click', async e=>{
    const b=e.target.closest('button[data-delta]'); if(!b) return;
    const tr=b.closest('tr'); const vid=tr.dataset.vid; const delta=parseInt(b.dataset.delta,10);
    const r=await sb.rpc('adjust_variant_qty_at_location', { p_variant_id: vid, p_location_id: currentLoc, p_delta: delta });
    if(r.error){ alert('Fout: '+r.error.message); return; }
    await renderTable();
  });

  document.getElementById('addProductForm').addEventListener('submit', async e=>{
    e.preventDefault();
    const name=document.getElementById('newName').value.trim();
    const desc=document.getElementById('newDesc').value.trim();
    const image=document.getElementById('newImage').value.trim();
    const sizes=document.getElementById('newSizes').value.split(',').map(s=>s.trim()).filter(Boolean);
    const qty=Math.max(0, parseInt(document.getElementById('newQty').value||'0',10));
    if(!currentLoc) return alert('Kies eerst locatie.');
    const prod=await sb.from('products').insert({ name, descnl:desc, image, is_active:true }).select('*').single();
    if(prod.error){ alert('Product fout: '+prod.error.message); return; }
    const vars=await sb.from('product_variants').insert(sizes.map(s=>({ product_id: prod.data.id, size: s }))).select('*');
    if(vars.error){ alert('Varianten fout: '+vars.error.message); return; }
    const stock=(vars.data||[]).map(v=>({ variant_id: v.id, location_id: currentLoc, qty }));
    const st=await sb.from('variant_stock').insert(stock); if(st.error){ alert('Voorraad fout: '+st.error.message); return; }
    e.target.reset(); alert('Product toegevoegd @ locatie.'); renderTable();
  });

  async function init(){ await loadLocations(); if(!locations.length){ await sb.from('locations').insert({ name:'Magazijn' }); await loadLocations(); } await renderTable(); }
})();