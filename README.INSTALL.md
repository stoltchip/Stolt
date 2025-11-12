# Stolt Haven Moerdijk – Magazijn (NL, jasny motyw) z lokacjami + PIN 2468
To repo jest gotowe do wrzucenia na **GitHub Pages**. Front łączy się z **Supabase** (Free).

## 1) Konfiguracja `config.js`
Skopiuj `config.example.js` jako `config.js` i wklej swój Project URL + anon key:
```js
window.SUPABASE_CONFIG = {
  url: "https://TWOJ-PROJEKT.supabase.co",
  anonKey: "TWÓJ_ANON_PUBLIC_KEY",
  storageBucket: "product-images"
};
```

## 2) Migracja bazy (Supabase → SQL Editor → Run)
Utworzy strukturę + ustawi PIN 2468 + doda startowe lokacje i asortyment.

```sql
create extension if not exists pgcrypto;

-- Podstawowe tabele (jeśli nie masz)
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text,
  descnl text,
  image text,
  is_active boolean default true
);
create table if not exists product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  size text
);
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  name text,
  items jsonb,
  created_at timestamp default now()
);
create table if not exists settings (
  id int primary key default 1,
  admin_password_sha256 text not null,
  admin_pin_sha256 text not null
);

-- Lokacje + stany per lokacja
create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  name text unique not null
);
create table if not exists variant_stock (
  variant_id uuid references product_variants(id) on delete cascade,
  location_id uuid references locations(id) on delete cascade,
  qty int default 0,
  primary key (variant_id, location_id)
);

-- RPC
create or replace function decrement_variant_qty_at_location(p_product_id uuid, p_size text, p_location_id uuid)
returns boolean language plpgsql as $$
declare v_id uuid; v_qty int;
begin
  select v.id, coalesce(s.qty,0) into v_id, v_qty
  from product_variants v
  left join variant_stock s on s.variant_id=v.id and s.location_id=p_location_id
  where v.product_id=p_product_id and v.size=p_size
  for update;
  if v_id is null or v_qty<=0 then return false; end if;
  update variant_stock set qty=qty-1 where variant_id=v_id and location_id=p_location_id;
  if not found then return false; end if;
  return true;
end; $$;

create or replace function adjust_variant_qty_at_location(p_variant_id uuid, p_location_id uuid, p_delta int)
returns boolean language sql as $$
  insert into variant_stock(variant_id, location_id, qty)
  values (p_variant_id, p_location_id, greatest(0, p_delta))
  on conflict (variant_id, location_id) do update
    set qty = greatest(0, variant_stock.qty + excluded.qty)
  returning true;
$$;

-- Ustaw PIN 2468 (hasło puste)
insert into settings (id, admin_password_sha256, admin_pin_sha256)
values (
  1,
  encode(digest('','sha256'),'hex'),
  encode(digest('2468','sha256'),'hex')
)
on conflict (id) do update set
  admin_password_sha256 = excluded.admin_password_sha256,
  admin_pin_sha256 = excluded.admin_pin_sha256;

-- Lokacje startowe
insert into locations(name) values ('Magazijn A') on conflict do nothing;
insert into locations(name) values ('Magazijn B') on conflict do nothing;
insert into locations(name) values ('Gate Zuid') on conflict do nothing;

-- Asortyment + warianty
insert into products (name, descnl, image, is_active) values
('Bodywarmer','Bodywarmer, hoge zichtbaarheid – geschikt voor buitenwerk.','',true),
('Werkjas','Werkjas, wind- en waterafstotend.','',true),
('Veiligheidsschoenen (laag)','Laag model, veiligheidsneus S3.','',true),
('Veiligheidslaarzen (hoog)','Hoog model, chemisch bestendig.','',true),
('Chemiepak (groen)','Groen chemiepak, spatdicht.','',true),
('Chemie laarzen','Chemiebestendige laarzen.','',true)
on conflict do nothing;

-- Dodaj warianty rozmiarowe
with p as (select id,name from products)
insert into product_variants (product_id,size)
select (select id from p where name='Bodywarmer'), s from unnest(array['S','M','L','XL','XXL']) s
union all
select (select id from p where name='Werkjas'), s from unnest(array['S','M','L','XL','XXL']) s
union all
select (select id from p where name='Veiligheidsschoenen (laag)'), s from generate_series(39,46) s::text
union all
select (select id from p where name='Veiligheidslaarzen (hoog)'), s from generate_series(39,46) s::text
union all
select (select id from p where name='Chemiepak (groen)'), s from unnest(array['M','L','XL','XXL']) s
union all
select (select id from p where name='Chemie laarzen'), s from generate_series(39,46) s::text
on conflict do nothing;

-- Ustaw stany startowe na wszystkich lokacjach
insert into variant_stock(variant_id, location_id, qty)
select v.id, l.id, case
  when v.size ~ '^[0-9]+$' then 4
  when v.size in ('S','M','L','XL','XXL') then 3
  else 2 end
from product_variants v cross join locations l
on conflict (variant_id,location_id) do nothing;
```

## 3) Deploy (GitHub Pages)
- Wgraj pliki do repo (root): `index.html`, `admin.html`, `styles.css`, `config.js`, skrypty, `img/`.
- Settings → Pages → Branch: `main`, folder: `/ (root)` → Save.
- Publiczny adres: `https://twoj-login.github.io/NAZWA-REPO/`.

## 4) Użycie
- **Pracownik (index.html):** wybierz **Locatie** → wybierz jeden produkt + rozmiar → wpisz **Naam** → **Bestelling versturen** (stan schodzi z wybranej lokacji).
- **Admin (admin.html):** PIN **2468** → wybierz **Locatie** → korekty +1/−1 → **Nieuw product** (dodaje od razu do wybranej lokacji).

Powodzenia!
