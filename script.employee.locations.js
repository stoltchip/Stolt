(()=>{
  const $=s=>document.querySelector(s);
  $('#year').textContent=new Date().getFullYear();
  const sb = window.supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey);

  let products=[], variants=[], locations=[], selectedLocation=null, selected=null;
  const esc=s=>(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const sum=o=>Object.values(o).reduce((a,b)=>a+(b||0),0);

  async function loadLocations(){
    const r=await sb.from('locations').select('*').order('name'); locations=r.data||[];
    const sel=$('#locationSelect'); sel.innerHTML=locations.map(l=>`<option value="${l.id}">${l.name}</option>`).join('');
    const saved=localStorage.getItem('shm_loc'); if(saved && locations.find(l=>l.id===saved)) sel.value=saved;
    selectedLocation=sel.value||locations[0]?.id||null;
    sel.onchange=()=>{ selectedLocation=sel.value; localStorage.setItem('shm_loc',selectedLocation); render(); };
  }
  async function loadData(){
    const p=await sb.from('products').select('*').eq('is_active',true).order('name');
    const v=await sb.from('product_variants').select('*');
    const s=await sb.from('variant_stock').select('*').eq('location_id', selectedLocation||'00000000-0000-0000-0000-000000000000');
    products=p.data||[]; variants=v.data||[]; window.__stock=s.data||[];
  }
  const qtyFor=(pid,size)=>{ const varId=(variants.find(v=>v.product_id===pid && v.size===size)||{}).id;
    if(!varId) return 0; return (window.__stock.find(x=>x.variant_id===varId)?.qty)||0; };

  async function render(){
    await loadData();
    const g=$('#productsGrid'); g.innerHTML='';
    products.forEach(p=>{
      const sizes={}; variants.filter(v=>v.product_id===p.id).forEach(v=>sizes[v.size]=qtyFor(p.id,v.size));
      const total=sum(sizes);
      const el=document.createElement('article'); el.className='card';
      el.innerHTML=`<div class="content"><h3>${esc(p.name)}</h3><p class="small">${esc(p.descnl||'')}</p>
        <div class="meta"><span>Voorraad @ locatie: <strong>${total}</strong></span>
        <span class="badge ${total<=2?'low':''}">${total<=2?'Laag':''}</span></div>
        <div class="size-row"><select data-id="${p.id}"><option value="">Maat kiezen…</option>${
          Object.entries(sizes).map(([s,q])=>`<option value="${s}" ${q<=0?'disabled':''}>${s} (${q})</option>`).join('')
        }</select><button class="btn primary" data-action="order" data-id="${p.id}">Bestellen</button></div></div>`;
      g.appendChild(el);
    });
    g.onclick=e=>{
      const b=e.target.closest('button[data-action="order"]'); if(!b) return;
      const pid=b.dataset.id; const sel=b.parentElement.querySelector('select'); const size=sel.value;
      if(!selectedLocation) return alert('Kies eerst locatie.'); if(!size) return alert('Kies maat.');
      selected={product_id:pid,size}; alert('Geselecteerd. Vul naam en verstuur.');
    };
  }

  $('#orderForm').addEventListener('submit', async e=>{
    e.preventDefault();
    const naam=$('#naam').value.trim(); if(!naam) return alert('Naam is verplicht.');
    if(!selected||!selectedLocation) return alert('Kies artikel/maat/locatie.');
    const r=await sb.rpc('decrement_variant_qty_at_location',{p_product_id:selected.product_id,p_size:selected.size,p_location_id:selectedLocation});
    if(r.error || r.data!==true){ return alert('Niet op voorraad of fout.'); }
    await sb.from('orders').insert({ name: naam, items: [{...selected, location_id:selectedLocation}] });
    selected=null; e.target.reset(); alert('Bestelling geregistreerd.'); render();
  });

  (async()=>{ await loadLocations(); await render(); })();
})();