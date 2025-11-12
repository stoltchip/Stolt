# Stolt Haven Moerdijk – Magazijn (NL)

Front-end (GitHub Pages) + Supabase (DB). Twee panelen:
- **Werknemer** (`index.html`): bestellen per locatie/maat.
- **Beheer** (`admin.html`): PIN 2468, korekty stanów, dodawanie produktów.

## Szybki start

1. **Utwórz projekt Supabase** i skopiuj:
   - `Project URL`
   - `anon public key`

2. **Baza danych – uruchom 3 bloki SQL kolejno** (w SQL Editor):
### BLOK 1 — Struktura
```
create extension if not exists pgcrypto;

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
```

### BLOK 2 — Funkcje RPC
```
create or replace function decrement_variant_qty_at_location(
  p_product_id uuid,
  p_size text,
  p_location_id uuid
)
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

create or replace function adjust_variant_qty_at_location(
  p_variant_id uuid,
  p_location_id uuid,
  p_delta int
)
returns boolean language sql as $$
  insert into variant_stock(variant_id, location_id, qty)
  values (p_variant_id, p_location_id, greatest(0, p_delta))
  on conflict (variant_id, location_id) do update
    set qty = greatest(0, variant_stock.qty + excluded.qty)
  returning true;
$$;
```

### BLOK 3 — PIN + seed (lokacje, produkty, warianty, stany)
```
-- PIN 2468 (puste hasło)
insert into settings (id, admin_password_sha256, admin_pin_sha256)
values (1, encode(digest('','sha256'),'hex'), encode(digest('2468','sha256'),'hex'))
on conflict (id) do update
set admin_password_sha256 = excluded.admin_password_sha256,
    admin_pin_sha256      = excluded.admin_pin_sha256;

-- Lokacje
insert into locations (name) values ('Magazijn A') on conflict do nothing;
insert into locations (name) values ('Magazijn B') on conflict do nothing;
insert into locations (name) values ('Gate Zuid') on conflict do nothing;

-- Produkty
insert into products (name, descnl, image, is_active) values
('Bodywarmer','Bodywarmer, hoge zichtbaarheid – geschikt voor buitenwerk.','',true),
('Werkjas','Werkjas, wind- en waterafstotend.','',true),
('Veiligheidsschoenen (laag)','Laag model, veiligheidsneus S3.','',true),
('Veiligheidslaarzen (hoog)','Hoog model, chemisch bestendig.','',true),
('Chemiepak (groen)','Groen chemiepak, spatdicht.','',true),
('Chemie laarzen','Chemiebestendige laarzen.','',true)
on conflict do nothing;

-- Warianty – odporne na brak dopasowań (JOIN po name)
insert into product_variants (product_id, size)
select p.id, x.size
from products p
join (
  select 'Bodywarmer' as name, unnest(array['S','M','L','XL','XXL']) as size
  union all
  select 'Werkjas', unnest(array['S','M','L','XL','XXL'])
  union all
  select 'Veiligheidsschoenen (laag)', gs::text from generate_series(39,46) gs
  union all
  select 'Veiligheidslaarzen (hoog)', gs::text from generate_series(39,46) gs
  union all
  select 'Chemiepak (groen)', unnest(array['M','L','XL','XXL'])
  union all
  select 'Chemie laarzen', gs::text from generate_series(39,46) gs
) x on x.name = p.name
on conflict do nothing;

-- Stany startowe per lokacja (nadpisz jeśli są 0)
insert into variant_stock (variant_id, location_id, qty)
select v.id, l.id,
  case when v.size ~ '^[0-9]+$' then 4
       when v.size in ('S','M','L','XL','XXL') then 3
       else 2 end
from product_variants v
cross join locations l
on conflict (variant_id, location_id)
do update set qty = excluded.qty;
```

3. **Wyłącz RLS (na czas testów)** w Supabase dla tabel: `products`, `product_variants`, `orders`, `settings`, `locations`, `variant_stock` (UI: Table editor → bezpieczeństwo).  
   > Produkcyjnie dodaj polityki zgodnie z potrzebami.

4. **Skonfiguruj front**:
   - Skopiuj `config.example.js` do `config.js` i wprowadź swój `SUPABASE_URL` oraz `SUPABASE_ANON_KEY`.
   - Zdeployuj folder jako GitHub Pages (branch `main` / `/root` lub `/docs`).

5. **GitHub Pages**:
   - Repo → Settings → Pages → Source: `Deploy from a branch` → wybierz główną gałąź i folder (np. `/`).
   - Po publikacji odśwież stronę 1–2x (CDN).

## Testowanie

### Werknemer (index.html)
1. Wybierz **Locatie**.
2. Wpisz **Naam**.
3. Na karcie produktu wybierz **Maat kiezen** i kliknij **Bestellen**.  
   - Aplikacja wywoła RPC `decrement_variant_qty_at_location`. Gdy zwróci `false`, brak stanu.
   - Następnie zapisze zamówienie do tabeli `orders` w formacie JSONB.

### Beheer (admin.html)
1. Zaloguj się PIN-em **2468** (hash porównywany lokalnie z `settings.admin_pin_sha256`).
2. Wybierz **Locatie**.
3. Tabela wyświetli *Produkt / Maat / Voorraad*. Użyj przycisków **−1 / +1** (RPC `adjust_variant_qty_at_location`).
4. Formularz **Nieuw product** utworzy produkt, warianty oraz wstępne wpisy w `variant_stock` dla wybranej lokacji.

## FAQ

**Brak danych / 401 w przeglądarce**  
Upewnij się, że RLS jest wyłączone (lub są dodane polityki), a klucz `anon` jest poprawny.

**Błąd RPC lub „function not found”**  
Sprawdź, czy wykonałeś *BLOK 2 — Funkcje RPC* i czy nazwy funkcji się zgadzają.

**„syntax error at end of input” przy SQL**  
Uruchamiaj dokładnie 3 bloki w tej kolejności, bez dodatkowych średników po blokach.

**PIN nie działa**  
Zweryfikuj, że *BLOK 3* został wykonany i w tabeli `settings` jest hash PIN-u. Pole jest porównywane z SHA-256 w przeglądarce.

**CORS / GitHub Pages**  
Jeśli hostujesz na innej domenie, sprawdź w Supabase ustawienia CORS (Auth → URL-y) i dodaj adres strony.

---

© Stolt Haven Moerdijk – UI jasny, akcent #FFCC00. 
