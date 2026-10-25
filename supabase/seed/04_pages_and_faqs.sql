-- =============================================================================
-- DEVELOPMENT CONTENT SEED  —  DO NOT RUN AGAINST PRODUCTION
-- =============================================================================
--
-- Seeds the CMS pages and FAQs that Phase 11 renders from the database.
--
-- -----------------------------------------------------------------------------
-- IDEMPOTENCY
-- -----------------------------------------------------------------------------
--
-- Every row uses a fixed UUID and `on conflict (id) do update`, so re-running
-- this file updates the seeded rows in place rather than deleting rows an
-- administrator created. The `0…04xx` prefix keeps the seeded ids recognisable.
--
-- -----------------------------------------------------------------------------
-- THE CONTENT IS OURS
-- -----------------------------------------------------------------------------
--
-- The prose below is written for this store. It is not copied from the reference
-- site, and it makes no claim of authorised-dealer status. It is deliberately
-- plain about the fact that this site takes no payment online: every policy that
-- touches money says the same thing the rest of the site does.
--
-- `status = 'published'` with a `published_at` because the table constrains a
-- published row to carry a timestamp. The content is stored as structured blocks
-- (see `src/lib/content/types.ts`), not HTML, so the renderer decides what
-- elements are emitted.

-- -----------------------------------------------------------------------------
-- pages
-- -----------------------------------------------------------------------------
--
-- Upserted on `slug`, not `id`, because migration 0006 already created draft
-- system pages at two of these slugs (`shipping`, `warranty`). Keying on the slug
-- updates those rows in place and keeps the app route and the row in step, which
-- keying on `id` would not: it would collide on the unique slug index instead.
--
-- The slugs are the ones the footer links to (`/pages/about`, `/pages/faq`,
-- `/pages/privacy`, `/pages/terms`, `/pages/shipping`, `/pages/warranty`), which
-- are the routes this phase builds. Migration 0006 used longer names
-- (`about-us`, `privacy-policy`, …); those rows are left untouched as inert
-- drafts and recorded in KNOWN_ISSUES.
insert into public.pages (id, slug, title, excerpt, content, status, published_at, seo_title, seo_description, is_system)
values
  (
    '00000000-0000-4000-8000-000000000401',
    'about',
    'About Us',
    'Who we are, how we work, and what we look for in a watch.',
    '[
      {"type":"paragraph","text":"We are a specialist dealer in pre-owned luxury watches. Every piece we offer is examined by our watchmakers, and we describe condition honestly and in detail."},
      {"type":"heading","text":"How we work","level":2},
      {"type":"list","items":[
        "Every watch is inspected and authenticated before it is offered.",
        "Condition is described plainly, including any refinishing or replacement parts.",
        "Payment is arranged directly with the boutique. This site does not take payment online.",
        "A piece is not reserved until we confirm it in writing."
      ]},
      {"type":"heading","text":"What we look for","level":2},
      {"type":"paragraph","text":"We look for watches with an honest history and complete documentation where it survives. Where a piece has been serviced or restored, we say so, and we say by whom."},
      {"type":"callout","tone":"info","text":"We are an independent dealer. We are not an authorised dealer for any of the brands we sell, and we do not claim to be."}
    ]'::jsonb,
    'published',
    now(),
    'About Us',
    'Who we are and how we work, and what we look for in a watch.',
    false
  ),
  (
    '00000000-0000-4000-8000-000000000402',
    'shipping',
    'Shipping',
    'How we deliver, insure and track a timepiece, and what to expect when it arrives.',
    '[
      {"type":"paragraph","text":"Every timepiece is sent fully insured, signature required, and tracked door to door."},
      {"type":"heading","text":"How we send","level":2},
      {"type":"list","items":[
        "Fully insured for the full value of the piece.",
        "Signature required on delivery, to the address on the order.",
        "Tracked door to door, with the tracking reference sent to you when it ships.",
        "Dispatched in discreet packaging that does not name the contents."
      ]},
      {"type":"heading","text":"Delivery times","level":2},
      {"type":"paragraph","text":"Most pieces are dispatched within two working days of payment being settled. International delivery times depend on customs in the destination country, which we cannot control."},
      {"type":"callout","tone":"warning","text":"Please inspect the parcel before signing where you can, and tell us within 24 hours if anything is wrong with it."}
    ]'::jsonb,
    'published',
    now(),
    'Shipping',
    'How we deliver, insure and track a timepiece.',
    false
  ),
  (
    '00000000-0000-4000-8000-000000000403',
    'warranty',
    'Returns & Warranty',
    'Our returns window and what our warranty covers.',
    '[
      {"type":"paragraph","text":"If a watch is not as we described it, tell us and we will put it right."},
      {"type":"heading","text":"Returns","level":2},
      {"type":"list","items":[
        "Tell us within 14 days of receiving the watch if you wish to return it.",
        "The watch must come back in the condition it was sent, with everything that accompanied it.",
        "We refund the purchase price once the watch has been inspected on return."
      ]},
      {"type":"heading","text":"Warranty","level":2},
      {"type":"list","items":[
        "Our warranty covers the movement for 12 months from the date of purchase.",
        "It does not cover accidental damage, water ingress after purchase, or normal wear.",
        "Work carried out by a third party voids it."
      ]},
      {"type":"callout","tone":"info","text":"This is a summary. Nothing here reduces your statutory rights."}
    ]'::jsonb,
    'published',
    now(),
    'Returns & Warranty',
    'Our returns window and what our warranty covers.',
    false
  ),
  (
    '00000000-0000-4000-8000-000000000404',
    'terms',
    'Terms of Use',
    'The terms on which this site and our sales operate.',
    '[
      {"type":"paragraph","text":"These terms apply to your use of this website and to any sale we agree with you."},
      {"type":"heading","text":"This website","level":2},
      {"type":"list","items":[
        "Prices and availability are confirmed at the time of your order request and may change.",
        "Photographs and descriptions are provided in good faith; measurements are approximate.",
        "This site does not take payment online. An order request is not a binding contract."
      ]},
      {"type":"heading","text":"Orders","level":2},
      {"type":"list","items":[
        "A contract is formed only when we confirm your order in writing and payment is settled.",
        "Adding a piece to your cart or wishlist does not reserve it.",
        "We may decline an order, for example if a piece has already been sold."
      ]},
      {"type":"callout","tone":"info","text":"Nothing on this website is an offer capable of acceptance. An order request is an invitation to treat."}
    ]'::jsonb,
    'published',
    now(),
    'Terms of Use',
    'The terms on which this site and our sales operate.',
    false
  ),
  (
    '00000000-0000-4000-8000-000000000405',
    'privacy',
    'Privacy Policy',
    'What personal data we hold, why we hold it and how you can ask us to remove it.',
    '[
      {"type":"paragraph","text":"We hold only what we need to answer your enquiry, fulfil an order and keep our own records straight."},
      {"type":"heading","text":"What we hold","level":2},
      {"type":"list","items":[
        "The details you give us when you enquire, request an order or create an account.",
        "Your order and service-request history, so we can answer questions about them.",
        "Basic technical information needed to keep the site working and secure."
      ]},
      {"type":"heading","text":"What we do with it","level":2},
      {"type":"list","items":[
        "To answer your enquiry and fulfil your order.",
        "To keep records we are required to keep.",
        "We do not sell your data, and we do not send marketing you did not ask for."
      ]},
      {"type":"heading","text":"Your rights","level":2},
      {"type":"paragraph","text":"You can ask us for a copy of what we hold, ask us to correct it, or ask us to delete it where we are not required to keep it. Contact us and we will respond."}
    ]'::jsonb,
    'published',
    now(),
    'Privacy Policy',
    'What personal data we hold and how we handle it.',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000406',
    'faq',
    'Frequently Asked Questions',
    'Answers on buying, selling, shipping and servicing.',
    '[
      {"type":"paragraph","text":"The questions below are the ones we are asked most often. If yours is not here, contact us and we will answer it directly."}
    ]'::jsonb,
    'published',
    now(),
    'Frequently Asked Questions',
    'Answers on buying, selling, shipping and servicing.',
    false
  )
on conflict (slug) do update
  set title           = excluded.title,
      excerpt         = excluded.excerpt,
      content         = excluded.content,
      status          = excluded.status,
      published_at    = excluded.published_at,
      seo_title       = excluded.seo_title,
      seo_description = excluded.seo_description,
      is_system       = excluded.is_system,
      updated_at      = now();

-- -----------------------------------------------------------------------------
-- faqs
-- -----------------------------------------------------------------------------
insert into public.faqs (id, question, answer, category, sort_order, is_published)
values
  ('00000000-0000-4000-8000-000000000451',
   'Are your watches authentic?',
   E'Every watch is examined and authenticated by our watchmakers before it is offered, and we describe condition honestly, including any refinishing or replacement parts.\n\nIf a piece is not as we described it, tell us and we will put it right.',
   'Buying', 10, true),
  ('00000000-0000-4000-8000-000000000452',
   'Can I pay online?',
   E'No. This website does not take payment. You submit an order request and a member of the team contacts you to arrange payment directly with the boutique.\n\nYour order is not confirmed until we have confirmed it in writing and payment has been settled.',
   'Buying', 20, true),
  ('00000000-0000-4000-8000-000000000453',
   'Does adding a watch to my cart reserve it?',
   E'No. A cart or wishlist is a list of pieces you are interested in. A piece is not reserved until we confirm it in writing.\n\nBecause most of our stock is a single piece, a watch can sell while it is in your cart. We re-check availability when you load your cart and when you submit an order request.',
   'Buying', 30, true),
  ('00000000-0000-4000-8000-000000000454',
   'How quickly will you reply to my enquiry?',
   E'We aim to reply within one working day. If you have asked about a specific piece, include the reference number if you have it and we will answer more precisely.',
   'Buying', 40, true),
  ('00000000-0000-4000-8000-000000000455',
   'How do you deliver a watch?',
   E'Every timepiece is sent fully insured, signature required and tracked door to door, in discreet packaging that does not name the contents.\n\nMost pieces are dispatched within two working days of payment being settled.',
   'Shipping', 10, true),
  ('00000000-0000-4000-8000-000000000456',
   'Can I return a watch?',
   E'Yes. Tell us within 14 days of receiving the watch if you wish to return it. It must come back in the condition it was sent, with everything that accompanied it, and we refund the purchase price once it has been inspected on return.\n\nNothing in our returns policy reduces your statutory rights.',
   'Shipping', 20, true),
  ('00000000-0000-4000-8000-000000000457',
   'What does your warranty cover?',
   E'Our warranty covers the movement for 12 months from the date of purchase. It does not cover accidental damage, water ingress after purchase or normal wear, and work carried out by a third party voids it.',
   'Servicing', 10, true),
  ('00000000-0000-4000-8000-000000000458',
   'Do you service watches you did not sell?',
   E'Yes. Send us the details through the repair and restoration page and a watchmaker will inspect the watch and send you an estimate before any work begins.',
   'Servicing', 20, true),
  ('00000000-0000-4000-8000-000000000459',
   'Will you buy my watch, or take it in part exchange?',
   E'We buy pre-owned luxury watches outright and take trades against pieces in our stock. Send us the brand, model, reference and condition through the sell or trade page and we will come back with a valuation.\n\nNothing is agreed until you accept the valuation.',
   'Selling', 10, true),
  ('00000000-0000-4000-8000-000000000460',
   'Can you find a specific watch for me?',
   E'Often, yes. Tell us the reference and the details that matter to you through the watch sourcing page and we will search our stock and our trade network.\n\nIf we find a piece, we send you the details and photographs. Nothing is ordered until you agree.',
   'Selling', 20, true)
on conflict (id) do update
  set question     = excluded.question,
      answer       = excluded.answer,
      category     = excluded.category,
      sort_order   = excluded.sort_order,
      is_published = excluded.is_published,
      updated_at   = now();
