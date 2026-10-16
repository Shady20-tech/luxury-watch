# Reference Analysis — carbonwatchcompany.com

Audit date: 2026-10-16
Method: direct HTTP retrieval of public HTML, XML sitemaps and `robots.txt`. No authenticated or
JS-only surfaces were exercised. Items that could not be verified are listed in
[Known access limitations](#known-access-limitations).

This document records **what the reference does**, so that we can rebuild the same information
architecture and interaction model with our own code, imagery and copy. Nothing here is a licence to
copy source code, theme assets or long passages of text.

---

## 1. Platform and observable stack

| Signal | Finding |
|---|---|
| Platform | Shopify (online store 2.0). `Shopify.shop = "carbon-watch-company.myshopify.com"` |
| Theme | `OMRUs - Slate Edit`, schema `Minimog - OS 2.0`, version `5.5.0` (third-party commercial theme) |
| Currency / locale | USD, `en`, country US |
| Fonts | Headings **Cardo** (serif, 400/700); Body **Nunito** (sans, 400/700). Self-hosted via `fonts.shopifycdn.com` with `preload` + `font-display: swap` |
| Analytics | Shopify rich-media storefront analytics |
| Search | Shopify predictive search (`Shopify.predictiveSearch = true`) |
| Agent surface | `robots.txt` advertises `agents.md`, `/.well-known/ucp` and a UCP/MCP endpoint |

**Implication for us:** the reference is a hosted SaaS storefront. We are building an equivalent
experience on Next.js 15 + Supabase, so every Shopify-specific mechanism (Liquid, theme editor,
Shopify checkout, `cart.js`) is replaced by our own implementation. The *experience* is the target,
not the technology.

---

## 2. Design tokens (extracted from published CSS custom properties)

Light theme (default):

| Token | Value | Use |
|---|---|---|
| `--color-background` | `255,255,255` | page background |
| `--color-background-secondary` | `245,245,245` | alternating sections, cards |
| `--color-foreground` | `34,34,34` | body text |
| `--color-foreground-secondary` | `102,102,102` | muted text |
| `--color-heading` | `161,128,64` | **gold accent** — headings |
| `--color-button` | `161,128,64` | primary button fill |
| `--color-button-text` | `255,255,255` | primary button label |
| `--color-button-hover` | `34,34,34` | primary hover fill |
| `--color-outline-button` | `161,128,64` | outline button border |
| `--color-border` | `238,238,238` | hairlines |
| `--color-price-regular` | `0,0,0` | price text |
| `--color-form-field` | `255,255,255` | inputs |

Dark theme also exists (`--color-background: 0,0,0`, `--color-heading: 255,255,255`) and a third
neutral theme (`247,247,247` / `233,233,233`).

**Takeaway:** the brand identity is a **gold (`#A18040`) on white/black luxury palette**, serif
display headings over a humanist sans body. We should reproduce the *character* (gold accent, serif
display, generous whitespace) with our own token set — not these exact RGB triplets, and not the
commercial theme's code.

Observed spacing rhythm: section padding multiples of 8px; `--section-padding-*` capped at 48px on
mobile; section headers `margin-bottom: 24px` mobile / `40px` desktop. Card tag text `12px`;
card title uses base size. Social icons `48×48px` circles, `gap: 12px`.

---

## 3. Site map and route taxonomy

Derived from `sitemap.xml` → `sitemap_products_*.xml`, `sitemap_collections_1.xml`,
`sitemap_pages_1.xml`, `sitemap_blogs_1.xml`.

### 3.1 Pages (15)
```
/pages/about-us
/pages/contact
/pages/faqs
/pages/sell-trade-your-watch
/pages/repair-restoration
/pages/watch-sourcing
/pages/satisfaction-guarantee
/pages/warranty
/pages/shipping
/pages/terms-of-use
/pages/privacy-policy
/pages/data-sharing-opt-out
/pages/wishlist
/pages/bags-by-carbon          (cross-sell: bags, not watches)
/pages/luxury-watches-a-modern-buying-experience   (editorial/content)
```

### 3.2 Collections (~44)
Four brand parents, each with model sub-collections:

- **Rolex** → Cellini, Cosmograph Daytona, Datejust, Day-Date, Explorer, GMT-Master II, Land-Dweller,
  Milgauss, Oyster Perpetual, Pearlmaster, Sea-Dweller, Sky-Dweller, Submariner, Yacht-Master, 1908
- **Audemars Piguet** → Code 11.59, Jules Audemars, Millenary, Royal Oak, Royal Oak Offshore,
  Royal Oak Concept
- **Patek Philippe** → Annual Calendar, Aquanaut, Calatrava, Complications, Cubitus, Gondolo,
  Grand Complications, Nautilus, World Time, Twenty-4
- **Richard Mille** → (parent only)
- Merchandising collections: `frontpage`, `featured-rolex`, `featured-ap`,
  `featured-patek-philippe`, `rolex-2025`, `patek-philippe-2025`, `audemars-piguet-2025`,
  `omrus-products`

**Implication:** we need a **two-level taxonomy** — Brand → Model — plus free-standing
*merchandising* collections (Featured, Year/Novelty, Curated). This must be data-driven, not
hardcoded: a `brands` table, a self-referencing `categories`/`models` table, and a
`collections` + `collection_products` join so merchandising sets can be curated independently of
the taxonomy.

### 3.3 Products
Product URLs are flat and SEO-descriptive: `/products/{brand}-{model}-{descriptor}-{reference}`,
e.g. `rolex-sea-dweller-43-watch-black-dial-126600`. The reference number is embedded as the slug
suffix. Product volume spans multiple sitemap pages (5 product sitemaps).

### 3.4 Blog
Single blog: `/blogs/news` (title "News"). Used for editorial/announcements.

### 3.5 Transactional
`/cart`, `/account/login`, `/account/register`, `/account`, `/pages/wishlist`, `/search`.

---

## 4. Global chrome

### 4.1 Top bar (utility bar)
- Phone number as a `tel:` link: `239-747-3128`
- Rotating marketing message: *"The Best Selection of Luxury Timepieces in Southwest Florida"* +
  **Shop Now** link
- Email as a `mailto:` link: `kaitlan@carbonwatchcompany.com`
- **Find a Store** link
- Social icons (Facebook, Instagram) with `column-gap: 30px`

### 4.2 Announcement bar
Dismissible, swiper-based, rotating messages (4 observed):
1. "Sell, Trade, or Buy: Your One-Stop Luxury Watch Shop"
2. "Shop with Confidence: Authenticity Guaranteed, Free Shipping"
3. "Join Our Exclusive WhatsApp Group for Insider Deals"
4. "Your Dream Watch, Sourced Globally: Let us find it for you."

Close control calls `.m-announcement-bar__close` → removes the bar. This is a **DB-configurable
announcement list**, not a hardcoded string, in our build.

### 4.3 Header / primary navigation
Left: logo. Centre/right: search, account (Log in / Register), wishlist, cart with live count.

Mega menu structure — **four brand columns**, each parent linking to its brand collection and
listing its model sub-collections:

| Brand column | Models listed |
|---|---|
| Rolex | Cellini, Cosmograph Daytona, Datejust, Day-Date, Explorer, GMT-Master II, Land-Dweller, Milgauss, Oyster Perpetual, Pearlmaster, Sea-Dweller, Sky-Dweller, Submariner, Yacht-Master, 1908 |
| Audemars Piguet | Code 11.59, Jules Audemars, Millenary, Royal Oak, Royal Oak Offshore, Royal Oak Concept |
| Patek Philippe | Annual Calendar, Aquanaut, Calatrava, Complications, Cubitus, Gondolo, Grand Complications, Nautilus, World Time, Twenty-4 |
| Richard Mille | — |

Standalone items: **Sell / Trade Your Watch**, **Contact Us**, **Schedule an Appointment**,
**Bags by Carbon**.

Mega menu is instantiated by a `Megamenu` class bound to the header — i.e. it is an enhanced,
keyboard-navigable panel, not a bare `<ul>`.

### 4.4 Search
Full-screen / overlay search with the placeholder "Search products" and a **Popular Searches** row:
Rolex, Audemars Piguet, Patek Philippe, Richard Mille. Predictive search enabled.

### 4.5 Age verification gate
Modal on load:
- Question: **"Are you 18 years old or older?"**
- Buttons: **No, I'm not** / **Yes, I am**
- Rejection state: *"Sorry, the content of this store can't be seen by a younger audience. Come back
  when you're older."*

We will implement an equivalent gate that is **accessible** (focus trap, `aria-modal`, Escape not
silently bypassing, no `user-scalable=0` lock) and remembers the choice.

### 4.6 Footer (four blocks + bottom bar)
1. **Newsletter** — "Carbon Watch Company Club / Join the Carbon Community to Stay Informed About
   Important Updates, New Arrivals, and Special Offers!" → Join Now
2. **Store / contact** — Entrada Building, Floor 2, 27975 Old 41 Rd. Unit 201, Bonita Springs,
   FL 34135 · phone · email
3. **Quick Links** — Sell/Trade, Repair/Restoration, Watch Sourcing, FAQs, About Us, Contact Us
4. **Store Policies** — Satisfaction Guarantee, Shipping, Terms of Use, Privacy Policy
5. **Stay Connected** — newsletter, WhatsApp group, Instagram
6. Bottom: social icons, copyright, disclaimer (`footer-disclaimer`)

On mobile the footer blocks collapse into accordions (`m-accordion--item-button` /
`m-accordion--item-content`).

### 4.7 Cart drawer
Slide-out drawer (`m-cart-drawer`) with `m-cart-drawer__footer` — cart is a drawer **and** a page
(`/cart`). Empty state: "Your cart is currently empty." + "Back to shopping".

---

## 5. Home page composition (top to bottom)

1. Announcement bar (rotating, dismissible)
2. Top bar (phone / message + Shop Now / email / Find a Store / socials)
3. Header + mega menu
4. **Hero** — H1 *"Your Destination for the Finest Luxury Watches in Southwest Florida"*, subcopy:
   *"Featuring renowned brands like Rolex, Audemars Piguet, Patek Philippe, and Richard Mille, we
   offer an unparalleled selection of exquisite watches. Our commitment to honesty, transparency,
   and exceptional service ensures a seamless experience for every client."* Video/image background
   (`m-hero__bg` supports `iframe` and `video` with `object-fit: cover`).
5. **Four value props** — Curated Selection ("Luxury Watches, Curated for You"), Expert Knowledge,
   Authenticity Assured, Competitive Pricing ("Affordable Luxury, Accessible to All")
6. **Brand/model showcase** — product grids per brand with "Add to cart" / "Add to wishlist" /
   **"Sold Out"** badges
7. **WhatsApp group CTA** — "Exclusive Deals, Delivered to You" → *Join "Watch Deals!"*
8. **Two service cards** — *Sell/Trade Your Watch* ("Get instant quotes and hassle-free
   transactions") and *Watch Sourcing* ("Access a global network of luxury timepieces"), each with
   **Get Started**
9. **Testimonials** — "Trust in the Way We Do Business", customer quotes with names
10. **Community / newsletter CTA** — "Carbon Watch Company Club" → Join Now
11. **Contact CTA** — "Have Any Questions?" → *Get In Touch With Us Today!* → Contact Us
12. Footer

---

## 6. Collection (PLP) template

- `data-filters-position="leftColumn"`, `data-filters-type="tags_filter"` → **left-column tag
  filters**
- **Sort options:** Featured, Most relevant, Best selling, Alphabetically A–Z, Alphabetically Z–A,
  Price low→high, Price high→low, Date old→new, Date new→old
- Product cards carry: image, tag/badge (incl. **Sold Out**), title, truncated description
  (single line, ellipsis), price area, **Add to cart**, **Add to wishlist**
- Prices on this store are frequently **"Request Pricing & Availability"** rather than a number —
  the product template exposes both a price path and an inquiry path
- `robots.txt` deliberately disallows `sort_by`, `+`, and repeated `filter` parameter combinations
  → **faceted-navigation crawl-trap hygiene is an explicit SEO concern** we must replicate

---

## 7. Product detail template (PDP)

- Breadcrumb: `Home / {Collection} / {Product title}`
- H1 = product title, e.g. *"Rolex Sea-Dweller 43 Watch - Black Dial - 126600"*
- Media gallery with thumbnail navigation
- **Two CTAs**: **Add to cart** and **Request Pricing & Availability** / **Ask a Question**
- An inline inquiry form with fields:
  `contact[name]` ("Your Name*"), `contact[phone]` ("Your Phone Number"),
  `contact[email]` ("Your Email*"), `contact[question]` ("Your Message*")
- **Recently Viewed Products** module
- `m-accordion` blocks (16 occurrences) → collapsible spec/description/policy sections
- Sticky add-to-cart behaviour on scroll
- Spec vocabulary observed in copy: reference number, case size, movement, year, condition,
  waterproof rating, box & papers, warranty

### 7.1 Structured data on the PDP
```json
{ "@type": "Organization", "name": "Carbon Watch Company", "url": "...",
  "logo": "...", "sameAs": ["facebook", "instagram"] }

{ "@type": "Product",
  "name": "Rolex Sea-Dweller 43 Watch - Black Dial - 126600",
  "image": ["..."], "description": "...", "sku": "126600",
  "brand": { "@type": "Brand", "name": "Carbon Watch Company" } }
```

Two honest observations we should improve on:
- `brand` is set to the **store name**, not the manufacturer. We will model a real `brands` table
  and emit the actual manufacturer, while never implying authorised-dealer status.
- There is **no `offers` node**. Because this store is inquiry-led for many SKUs, `offers` is
  legitimately absent when a price is not published. Where we do publish a price we will emit a
  valid `offers` object; where we do not, we omit it rather than emit a fake one.

---

## 8. Service flows

### 8.1 Sell / Trade Your Watch (`/pages/sell-trade-your-watch`)
Headings: *How to Sell Your Watch?* → Quick and Easy, Expert Evaluation, Hassle-Free Payment;
*How to Trade Your Watch* → Simple Start, Expert Valuation, Secure Shipping, Smooth Exchange;
*Why Choose Us…*; FAQ block. Ends in a contact/inquiry form.

### 8.2 Watch Sourcing (`/pages/watch-sourcing`)
*Exclusive Sourcing, Personalized Service*; *How it Works:* → Sourcing Process, Secure Purchase,
Delivery to Your Doorstep; *Why Choose Us…*; FAQs (rare/discontinued watches, lead time, private
sellers, authenticity). Inquiry form.

### 8.3 Repair & Restoration (`/pages/repair-restoration`)
*Expert Watch Repair & Restoration*; *Contact Us*; *Expert Valuation*; *Repair Process* → Return
Your Timepiece; *Why Choose Us…*; FAQs (repair types, turnaround, brands covered, warranty).
Inquiry form.

All three share the same inquiry pattern. **These become first-class database-backed request types**
(`sell_trade`, `sourcing`, `repair`) with their own admin workflow, not three static pages.

### 8.4 FAQ (`/pages/faqs`)
Real Q&A content, e.g. *How do I purchase a watch?*, *Do you offer discounts?*, *Can I make an
offer?*, *Are your watches guaranteed authentic?*, *Are pre-owned watches serviced?*, *Do you offer
a warranty?*, *Do watches include all original bracelet links?*, *Do you offer watch
customization?*, *Do all watches come with box and papers?*

### 8.5 Contact (`/pages/contact`)
Headings: *Contact Carbon Watch Company* / *We would love to hear from you.* Blocks: Address,
Information, Social Media. Note: **"Walk-ins welcome, appointments encouraged!"**
Form fields: `contact[name]`, `contact[email]`, `contact[phone]`, `contact[body]`.

---

## 9. Mobile behaviour

- Footer and some content blocks become accordions
- Mega menu collapses to a hamburger drawer with nested accordion sections
- Announcement bar uses swiper; top bar items reflow/condense
- Product cards reflow to 2-up then 1-up; `(min-width: 750px) calc((100vw - 120px) / 3)` and
  `calc((100vw - 35px) / 2)` sizing formulas observed
- Cart drawer is full-height on mobile

---

## 10. Accessibility observations (reference vs. what we will do)

| Reference signal | Assessment | Our target |
|---|---|---|
| `aria-label` used 153× | Good labelling effort | Keep, verify each is meaningful |
| `role=` used 15× | Sparse | Correct landmark/role usage |
| `<h1>` count = 1 per page | Correct | One `<h1>` per template |
| `viewport` = `maximum-scale=1.0, user-scalable=0` | **Blocks pinch-zoom — WCAG 1.4.4 failure** | Allow zoom (`maximum-scale=5`) |
| Age gate is a custom overlay | Risk of focus-trap / SR issues | Focus trap, `aria-modal`, keyboard-operable |
| Announcement bar auto-rotates | Risk for WCAG 2.2.2 (Pause, Stop, Hide) | Pausable, dismissible, `prefers-reduced-motion` aware |
| 62 `<img>` / 55 lazy | Reasonable | `next/image` with explicit dimensions and `sizes` |

---

## 11. SEO observations

Present and good:
- Canonical on every page
- Open Graph + Twitter card tags with title/description
- Descriptive, keyword-rich slugs including the reference number
- Product JSON-LD and Organization JSON-LD
- `robots.txt` with explicit `Disallow` for filters/sort traps and private paths
- XML sitemaps split by type with `<loc>` per entity

Gaps we intend to close:
- **No `offers` in Product JSON-LD** where a price is published
- `brand` set to the retailer rather than the manufacturer
- No `BreadcrumbList` structured data despite visible breadcrumbs
- No `WebSite` + `SearchAction` (sitelinks searchbox)
- No `FAQPage` structured data on FAQ/service pages that visibly render Q&A
- **`user-scalable=0`** harms mobile usability signals
- No visible evidence of `<lastmod>` discipline on collection/page sitemaps

---

## 12. Opportunities to improve on the reference

1. **Manual/offline order-request workflow.** The reference is an inquiry-led boutique; we make that
   explicit and honest: a customer selects an admin-enabled payment method (bank transfer, mobile
   money, cash on pickup), chooses delivery or pickup, submits an order request, and receives a
   confirmation that says *"request received — payment is arranged offline"*, never *"paid"*.
2. **Prices as real data.** Where a price exists it comes from the DB with a currency and an
   optional "price on request" flag; the two paths render distinctly and truthfully.
3. **Genuine faceted search** (brand, model, condition, year, case size, movement, price band) with
   canonicalised URLs and `noindex` on filtered permutations — the crawl-trap hygiene the reference
   only enforces via `robots.txt`.
4. **Full structured-data coverage**: Product + Offer (only when real), BreadcrumbList, WebSite +
   SearchAction, FAQPage, Organization, LocalBusiness for the physical showroom.
5. **Accessibility**: zoomable viewport, accessible age gate and mega menu, pausable carousels,
   visible focus rings, AA contrast for the gold accent on both light and dark surfaces.
6. **Database-driven announcements, navigation, collections, policies and FAQs** so merchandising
   changes need no redeploy.
7. **Dynamic sitemap `lastmod`** from each product's real `updated_at`, with cache invalidation on
   publish/edit/unpublish/archive/delete.
8. **Wishlist as a real feature** (the reference links `/pages/wishlist`); persisted per account and
   for guests, with an honest empty state.
9. **Admin surface** for products, brands, models, collections, inventory, orders, payment methods,
   inquiries, announcements, pages and SEO fields — the reference's admin is Shopify's; ours is ours.

---

## 13. Known access limitations

These are honest limitations of this audit. Nothing below was inspected directly.

| Item | Status | Consequence |
|---|---|---|
| `/account/login` | Returned an empty body (14 bytes) to non-JS clients; Shopify account UI is app-rendered | Account, order-history and wishlist UX inferred from nav links and standard patterns, not observed |
| `/cart` with items | Only the **empty** cart state was observable | Line-item layout, quantity controls and drawer behaviour inferred from markup/class names |
| Checkout | Not visited, and deliberately out of scope — we build **no** checkout/payment flow | — |
| Live search / predictive overlay | JS-only; markup and Popular Searches captured, results UI not observed | Search UX to be designed from the Popular Searches + predictive signals |
| Mega menu open state | Rendered by the `Megamenu` JS class | Hover/focus panel layout inferred from the link tree, not seen rendered |
| Filter result states | Filters are JS/applied-URL driven | Facet UI inferred from `data-filters-type="tags_filter"` |
| Mobile rendered layout | Responsive CSS inspected, no device emulation performed | Breakpoints taken from published media queries |
| Product sitemap totals | 5 product sitemaps exist; only the first was sampled | Exact catalogue size not counted |
| `agents.md` / UCP endpoints | Advertised in `robots.txt`, not fetched | Irrelevant to our build |

---

## 14. Rebranding and legal stance

The reference is a real business. We reproduce **structure and interaction patterns only**.

- No source code, theme CSS/JS, Liquid templates or proprietary assets are copied.
- No long passages of reference text are reproduced in our product. Marketing copy will be written
  fresh. The headings and short labels recorded above exist in this document solely as evidence of
  information architecture.
- Brand names (Rolex, Audemars Piguet, Patek Philippe, Richard Mille) are third-party trademarks. We
  display them only as factual product attributes from our own `brands` table. We will **not** claim
  authorised-dealer status, manufacturer endorsement or affiliation anywhere in the UI, metadata or
  structured data unless the business supplies verifiable evidence.
- Imagery must be original, licensed, or supplied by the business. Placeholder/seed imagery is
  clearly labelled as demo data.
- The store's own identity (name, logo, address, phone, email, colours, copy) is supplied by the
  project owner and must not be copied from the reference.
