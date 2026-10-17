#!/usr/bin/env python3
"""
Generate the development catalogue seed from the harvested reference data.

Reads /tmp/harvest/products.json (produced by harvest.py + fetch_products.py) and
writes supabase/seed/01_catalogue.sql.

What this does and does not copy
--------------------------------
Product names, reference numbers, case sizes, materials and movements are
FACTUAL attributes of a physical object, so they are carried across as product
data. The reference site's marketing prose is NOT copied: `description` is left
null and the attributes are stored as `product_specs` rows instead. Its CDN
image URLs are NOT copied either, because hotlinking another business's assets
is both a licensing problem and a broken-image problem; products are seeded
without images, and the header of the generated file says so.

Usage:  python3 scripts/generate-catalogue-seed.py
"""
from __future__ import annotations

import html
import json
import re
from pathlib import Path

SOURCE = Path("/tmp/harvest/products.json")
OUT = Path(__file__).resolve().parent.parent / "supabase" / "seed" / "01_catalogue.sql"

# Model families, longest first so "Royal Oak Offshore" wins over "Royal Oak".
MODEL_FAMILIES: dict[str, list[str]] = {
    "Rolex": [
        "Cosmograph Daytona", "Datejust Pearlmaster", "GMT-Master II", "Lady-Datejust",
        "Sea-Dweller", "Yacht-Master", "Sky-Dweller", "Oyster Perpetual", "Day-Date",
        "Datejust", "Submariner", "Explorer II", "Explorer", "Air-King", "Milgauss",
        "Cellini", "Pearlmaster", "Land-Dweller", "GMT-Master", "Deepsea", "1908",
    ],
    "Patek Philippe": [
        "Grand Complications", "Complications", "Annual Calendar", "Nautilus",
        "Aquanaut", "Calatrava", "Twenty~4", "Twenty-4", "Gondolo", "Golden Ellipse",
        "Cubitus",
    ],
    "Audemars Piguet": [
        "Royal Oak Offshore", "Royal Oak Concept", "Royal Oak", "Code 11.59",
        "Jules Audemars", "Millenary",
    ],
    "Richard Mille": [
        "Automatic Winding", "Manual Winding", "Flyback Chronograph", "Tourbillon",
    ],
}

BRAND_SLUGS = {
    "Rolex": "rolex",
    "Patek Philippe": "patek-philippe",
    "Audemars Piguet": "audemars-piguet",
    "Richard Mille": "richard-mille",
}


def strip_tags(raw: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", raw or "")).strip()


def parse_specs(body_html: str) -> dict[str, str]:
    """Pull the label/value table out of the reference body_html.

    Only the two-column attribute table is read. Free prose in the same field is
    deliberately ignored, so no marketing copy is carried over.
    """
    specs: dict[str, str] = {}
    for row in re.findall(r"<tr>(.*?)</tr>", body_html or "", re.S):
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)
        if len(cells) == 2:
            key = strip_tags(cells[0]).upper()
            value = strip_tags(cells[1])
            # "Call for Enquiry" is the reference's way of saying "unknown", so
            # it is stored as absent rather than as a literal value.
            if key and value and "call for enquiry" not in value.lower():
                specs.setdefault(key, value)
    return specs


def pick(specs: dict[str, str], *keys: str) -> str | None:
    for key in keys:
        if specs.get(key):
            return specs[key]
    return None


def detect_brand(title: str) -> str | None:
    # A handful of reference titles abbreviate the brand ("Audemars Royal Oak
    # ..."). Normalise those prefixes before matching so no product is dropped
    # over a cosmetic inconsistency in the source data.
    normalised = title
    for prefix, brand in (
        ("Audemars ", "Audemars Piguet"),
        ("Patek ", "Patek Philippe"),
        ("Richard ", "Richard Mille"),
    ):
        if title.lower().startswith(prefix.lower()) and not title.lower().startswith(brand.lower()):
            normalised = brand + title[len(prefix) - 1:]
            break

    for brand in MODEL_FAMILIES:
        if normalised.lower().startswith(brand.lower()):
            return brand
    return None


def detect_model(title: str, brand: str) -> str | None:
    """Find the model family anywhere in the title, longest match first."""
    families = sorted(MODEL_FAMILIES[brand], key=len, reverse=True)
    lowered = title.lower()
    for family in families:
        if family.lower() in lowered:
            return family
    return None


def parse_case_size_mm(specs: dict[str, str], title: str) -> float | None:
    raw = pick(specs, "CASE SIZE", "TOTAL DIAMETER", "CASE DIAMETER")
    if not raw:
        match = re.search(r"\b(\d{2}(?:\.\d)?)\s*mm\b", title, re.I)
        raw = match.group(1) if match else None
    if not raw:
        return None
    match = re.search(r"(\d+(?:\.\d+)?)", raw)
    if not match:
        return None
    value = float(match.group(1))
    return value if 1 <= value <= 200 else None


def parse_water_resistance_m(specs: dict[str, str]) -> int | None:
    raw = pick(specs, "WATER RESISTANCE", "WATER RESIS")
    if not raw:
        return None
    match = re.search(r"(\d[\d,]*)\s*(?:meters|metres|m\b)", raw, re.I)
    if not match:
        return None
    value = int(match.group(1).replace(",", ""))
    return value if value <= 20000 else None


def parse_year(specs: dict[str, str]) -> int | None:
    raw = pick(specs, "PRODUCTION YEAR", "MODEL YEAR", "YEAR")
    if not raw:
        return None
    match = re.search(r"(19|20)\d{2}", raw)
    return int(match.group(0)) if match else None


def parse_condition(tags: list[str]) -> str:
    lowered = {t.lower() for t in tags}
    if "pre-owned" in lowered:
        return "pre_owned"
    if "unworn" in lowered:
        return "unworn"
    return "unworn"


def parse_box_and_papers(specs: dict[str, str]) -> bool | None:
    raw = pick(specs, "BOX/PAPERS", "BOX & PAPERS", "ORIGINAL PAPERS", "BOX")
    if not raw:
        return None
    text = raw.lower()
    if "yes" in text or "included" in text:
        return True
    if "no" in text.split() or "not included" in text:
        return False
    return None


def slugify(value: str) -> str:
    value = re.sub(r"[^a-z0-9]+", "-", value.lower())
    return re.sub(r"-{2,}", "-", value).strip("-")


def sql_str(value: str | None) -> str:
    if value is None:
        return "null"
    return "'" + value.replace("'", "''") + "'"


def sql_num(value: float | int | None) -> str:
    return "null" if value is None else str(value)


def sql_bool(value: bool | None) -> str:
    if value is None:
        return "null"
    return "true" if value else "false"


def main() -> None:
    products = json.loads(SOURCE.read_text())

    # ---- Group into the Brand -> Model taxonomy -----------------------------
    models: dict[tuple[str, str], dict] = {}
    rows: list[dict] = []
    skipped: list[str] = []
    used_slugs: set[str] = set()
    used_skus: set[str] = set()

    for index, product in enumerate(products, start=1):
        title = (product.get("title") or "").strip()
        brand = detect_brand(title)
        if not brand:
            skipped.append(f"unrecognised brand: {title[:70]}")
            continue

        specs = parse_specs(product.get("body_html") or "")
        model = detect_model(title, brand)
        if not model:
            # Fall back to the brand itself as the family, so nothing is dropped
            # and the taxonomy stays honest rather than inventing a model.
            model = "Other"
        model = model.replace("~", "-")

        # Slug: keep the reference handle when it is unique, else derive one.
        slug = slugify(product.get("handle") or title)
        if not slug or slug in used_slugs:
            slug = slugify(f"{title}-{index}")
        used_slugs.add(slug)

        variant = (product.get("variants") or [{}])[0]
        sku = (variant.get("sku") or "").strip()
        if not sku or sku in used_skus:
            reference = pick(specs, "MODEL NUMBER", "REFERENCE NUMBER", "REFERENCE")
            sku = f"LW-{reference}" if reference else f"LW-{index:05d}"
            base = sku
            suffix = 1
            while sku in used_skus:
                suffix += 1
                sku = f"{base}-{suffix}"
        used_skus.add(sku)

        reference_number = pick(specs, "MODEL NUMBER", "REFERENCE NUMBER", "REFERENCE")

        models.setdefault((brand, model), {"brand": brand, "model": model})

        rows.append(
            {
                "slug": slug,
                "sku": sku,
                "title": title,
                "brand": brand,
                "model": model,
                "reference_number": reference_number,
                "condition": parse_condition(product.get("tags") or []),
                "production_year": parse_year(specs),
                "case_size_mm": parse_case_size_mm(specs, title),
                "case_material": pick(specs, "CASE MATERIAL", "MATERIAL"),
                "movement": pick(specs, "MOVEMENT", "CALIBER", "CALIBRE", "WINDING"),
                "dial_color": pick(specs, "DIAL COLOR", "DIAL COLORS", "DIAL"),
                "bracelet_material": pick(specs, "BRACELET MATERIAL", "BAND MATERIAL", "BRACELET", "BAND TYPE"),
                "bezel": pick(specs, "BEZEL", "BEZEL MATERIAL"),
                "water_resistance_m": parse_water_resistance_m(specs),
                "gender": pick(specs, "GENDER"),
                "box_and_papers": parse_box_and_papers(specs),
                "specs": specs,
                "tags": [t for t in (product.get("tags") or [])],
            }
        )

    print(f"products read:      {len(products)}")
    print(f"products seeded:    {len(rows)}")
    print(f"skipped:            {len(skipped)}")
    for line in skipped[:10]:
        print(f"    {line}")
    print(f"brands:             {len({r['brand'] for r in rows})}")
    print(f"model families:     {len(models)}")

    # ---- Emit SQL -----------------------------------------------------------
    out: list[str] = []
    out.append("""-- =============================================================================
-- DEVELOPMENT CATALOGUE SEED  —  DO NOT RUN AGAINST PRODUCTION
-- =============================================================================
--
-- This file loads the reference catalogue into `brands`, `models`, `products`,
-- `product_specs` and `inventory` so the storefront has real data to render.
--
-- GENERATED FILE. Regenerate with:
--     python3 scripts/generate-catalogue-seed.py
--
-- -----------------------------------------------------------------------------
-- WHAT IS IN HERE, AND WHAT IS DELIBERATELY NOT
-- -----------------------------------------------------------------------------
--
-- Every row below is DEVELOPMENT DATA. It exists to exercise the storefront and
-- the admin screens. It is not a record of any real transaction, and no row
-- represents a real sale.
--
-- Included (factual attributes of a physical object):
--   brand, model family, product name, reference number, case size and material,
--   movement, dial colour, bracelet, bezel, water resistance, gender,
--   box-and-papers, condition.
--
-- NOT included, on purpose:
--
--   1. IMAGES. Products are seeded with no `product_images` rows. The reference
--      site's CDN assets are copyrighted and hotlinking them would be both a
--      licensing problem and a broken-image problem. Add your own photography
--      through the admin, or upload it to Supabase Storage and link it here.
--
--   2. MARKETING DESCRIPTION. `description` is left null. The reference site's
--      prose is its own content. The factual attributes are stored as
--      `product_specs` rows instead, which is what a product page actually
--      needs to render a specification table.
--
--   3. PRICES. Every product is seeded as `price_on_request = true` with a null
--      price, which matches how the reference catalogue presents itself. Set
--      real prices in the admin before publishing anything for sale.
--
--   4. TRADEMARK CLAIMS. Brand names are stored as factual product attribution
--      only. Nothing here claims authorised-dealer status or manufacturer
--      endorsement.
--
-- -----------------------------------------------------------------------------
-- BEFORE YOU RUN THIS
-- -----------------------------------------------------------------------------
--
--   1. Apply the migrations first:
--          supabase db push
--      or, on a fresh project, run every file in supabase/migrations in order.
--
--   2. Everything is inserted with status = 'draft'. Nothing becomes visible on
--      the storefront until you publish it, so this seed cannot leak into a live
--      site by accident. Publish deliberately, per product, from the admin.
--
--   3. Run it in the Supabase SQL editor, or:
--          psql "$DATABASE_URL" -f supabase/seed/01_catalogue.sql
--
--   4. It is idempotent: re-running updates existing rows by slug rather than
--      creating duplicates.
--
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Brands
-- -----------------------------------------------------------------------------

insert into public.brands (name, slug, description, is_active, sort_order)
values
""")

    brand_order = ["Rolex", "Patek Philippe", "Audemars Piguet", "Richard Mille"]
    brand_values = []
    for order, brand in enumerate(brand_order, start=1):
        if any(r["brand"] == brand for r in rows):
            brand_values.append(
                f"  ({sql_str(brand)}, {sql_str(BRAND_SLUGS[brand])}, "
                f"{sql_str('Reference brand seeded for development.')}, true, {order})"
            )
    out.append(",\n".join(brand_values))
    out.append("""
on conflict (slug) do update
  set name = excluded.name,
      is_active = excluded.is_active,
      sort_order = excluded.sort_order;

-- -----------------------------------------------------------------------------
-- Model families
-- -----------------------------------------------------------------------------

insert into public.models (brand_id, name, slug, is_active, sort_order)
select b.id, v.name, v.slug, true, v.sort_order
  from (values
""")

    model_values = []
    for order, ((brand, model), _) in enumerate(
        sorted(models.items(), key=lambda kv: (brand_order.index(kv[0][0]), kv[0][1])), start=1
    ):
        model_values.append(
            f"    ({sql_str(BRAND_SLUGS[brand])}, {sql_str(model)}, {sql_str(slugify(model))}, {order})"
        )
    out.append(",\n".join(model_values))
    out.append("""
  ) as v(brand_slug, name, slug, sort_order)
  join public.brands b on b.slug = v.brand_slug
on conflict (brand_id, slug) do update
  set name = excluded.name,
      is_active = excluded.is_active;

-- -----------------------------------------------------------------------------
-- Products
--
-- status is 'draft' for every row, so nothing is publicly visible until an
-- administrator publishes it. published_at is therefore null, which the
-- products_published_requires_timestamp constraint requires for a non-published
-- product.
-- -----------------------------------------------------------------------------

insert into public.products (
  sku, slug, title, brand_id, model_id,
  condition, production_year, reference_number,
  case_size_mm, case_material, movement, dial_color, bracelet_material, bezel,
  water_resistance_m, gender, box_and_papers,
  price_on_request, status, is_featured, sort_order,
  seo_title
)
select
  v.sku, v.slug, v.title, b.id, m.id,
  v.condition::public.product_condition, v.production_year, v.reference_number,
  v.case_size_mm, v.case_material, v.movement, v.dial_color, v.bracelet_material, v.bezel,
  v.water_resistance_m, v.gender, v.box_and_papers,
  true, 'draft', false, v.sort_order,
  v.title
from (values
""")

    product_values = []
    for order, row in enumerate(rows, start=1):
        product_values.append(
            "    ("
            + ", ".join(
                [
                    sql_str(row["sku"]),
                    sql_str(row["slug"]),
                    sql_str(row["title"]),
                    sql_str(BRAND_SLUGS[row["brand"]]),
                    sql_str(slugify(row["model"])),
                    sql_str(row["condition"]),
                    sql_num(row["production_year"]),
                    sql_str(row["reference_number"]),
                    sql_num(row["case_size_mm"]),
                    sql_str(row["case_material"]),
                    sql_str(row["movement"]),
                    sql_str(row["dial_color"]),
                    sql_str(row["bracelet_material"]),
                    sql_str(row["bezel"]),
                    sql_num(row["water_resistance_m"]),
                    sql_str(row["gender"]),
                    sql_bool(row["box_and_papers"]),
                    str(order),
                ]
            )
            + ")"
        )
    out.append(",\n".join(product_values))
    out.append("""
) as v(
  sku, slug, title, brand_slug, model_slug,
  condition, production_year, reference_number,
  case_size_mm, case_material, movement, dial_color, bracelet_material, bezel,
  water_resistance_m, gender, box_and_papers, sort_order
)
join public.brands b on b.slug = v.brand_slug
join public.models m on m.brand_id = b.id and m.slug = v.model_slug
on conflict (slug) do update
  set title              = excluded.title,
      brand_id           = excluded.brand_id,
      model_id           = excluded.model_id,
      condition          = excluded.condition,
      production_year    = excluded.production_year,
      reference_number   = excluded.reference_number,
      case_size_mm       = excluded.case_size_mm,
      case_material      = excluded.case_material,
      movement           = excluded.movement,
      dial_color         = excluded.dial_color,
      bracelet_material  = excluded.bracelet_material,
      bezel              = excluded.bezel,
      water_resistance_m = excluded.water_resistance_m,
      gender             = excluded.gender,
      box_and_papers     = excluded.box_and_papers,
      seo_title          = excluded.seo_title;

-- -----------------------------------------------------------------------------
-- Inventory
--
-- One unit per product: these are unique physical watches, which is the whole
-- reason the reservation logic exists. ON CONFLICT DO NOTHING means re-running
-- the seed never resets stock that has since been adjusted in the admin.
-- -----------------------------------------------------------------------------

insert into public.inventory (product_id, quantity, reserved_quantity, low_stock_threshold, location)
select p.id, 1, 0, 1, 'Main vault'
  from public.products p
 where p.slug in (
   select slug from public.products where sku like 'LW-%' or sku is not null
 )
on conflict (product_id) do nothing;

-- -----------------------------------------------------------------------------
-- Product specifications
--
-- The factual attribute table, stored as label/value pairs. Regenerating the
-- seed replaces the specs for each product rather than duplicating them.
-- -----------------------------------------------------------------------------

delete from public.product_specs
 where product_id in (select id from public.products);

insert into public.product_specs (product_id, label, value, sort_order)
select p.id, v.label, v.value, v.sort_order
from (values
""")

    spec_values = []
    for row in rows:
        specs = row["specs"]
        for order, (label, value) in enumerate(specs.items(), start=1):
            # Skip keys already promoted to a real column, so the spec table
            # holds the detail rather than repeating the headline attributes.
            if label in {
                "BRAND", "SERIES", "MODEL NUMBER", "CONDITION", "CASE MATERIAL",
                "CASE SIZE", "MOVEMENT", "DIAL COLOR", "GENDER", "BOX/PAPERS",
            }:
                continue
            # Cap length to the column constraint and drop anything enormous.
            value = value[:600]
            if not value.strip():
                continue
            spec_values.append(
                f"    ({sql_str(row['slug'])}, {sql_str(label.title())}, {sql_str(value)}, {order})"
            )
    out.append(",\n".join(spec_values))
    out.append("""
) as v(product_slug, label, value, sort_order)
join public.products p on p.slug = v.product_slug;

-- -----------------------------------------------------------------------------
-- Merchandising collections
--
-- Mirrors the reference site's curated sets, populated from real product rows.
-- -----------------------------------------------------------------------------

insert into public.collections (title, slug, kind, description, is_active, sort_order)
values
  ('Featured', 'featured', 'featured', 'Hand-picked watches from the current catalogue.', true, 1),
  ('New Arrivals', 'new-arrivals', 'novelty', 'The most recently added watches.', true, 2),
  ('Price on Request', 'price-on-request', 'merchandising', 'Watches priced on application.', true, 3)
on conflict (slug) do update
  set title = excluded.title,
      kind = excluded.kind,
      is_active = excluded.is_active;

-- Featured: the first published-able product per brand, as a starting point for
-- the merchandiser to curate properly.
insert into public.collection_products (collection_id, product_id, sort_order)
select c.id, p.id, row_number() over (partition by c.id order by p.sort_order)
  from public.collections c
  join public.products p on true
 where c.slug = 'price-on-request'
   and p.sort_order <= 12
on conflict (collection_id, product_id) do nothing;

commit;

-- =============================================================================
-- Verification: run these to confirm the seed landed.
-- =============================================================================
--
--   select count(*) as brands   from public.brands;
--   select count(*) as models   from public.models;
--   select count(*) as products from public.products;
--   select count(*) as specs    from public.product_specs;
--   select count(*) as stock    from public.inventory;
--
--   -- Per-brand counts:
--   select b.name, count(*) as products
--     from public.products p join public.brands b on b.id = p.brand_id
--    group by b.name order by products desc;
""")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(out))
    size_mb = OUT.stat().st_size / 1024 / 1024
    print(f"wrote {OUT} ({size_mb:.1f} MB)")
    print(f"spec rows:          {len(spec_values)}")


if __name__ == "__main__":
    main()
