/**
 * Whether a media asset is still in use somewhere.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS IS NOT A DATABASE TRIGGER
 * -----------------------------------------------------------------------------
 *
 * An asset can be referenced from five places that do not share a foreign key:
 * `products.og_image_url`, `pages.hero_image_url`, `homepage_sections.image_url`,
 * `site_settings.logo_url`, and a page body block. A trigger on `media` cannot
 * see any of them, and five triggers would each have to duplicate the rule.
 *
 * So the check lives here, runs on delete, and refuses the delete when a
 * reference exists. The consequence is that a reference written *after* the check
 * — by a concurrent editor — is not caught. That is an acceptable window for a
 * storefront: the worst case is a broken image, which every consumer already
 * renders as a labelled placeholder, not a broken page or lost data.
 *
 * -----------------------------------------------------------------------------
 * HOW A REFERENCE IS MATCHED
 * -----------------------------------------------------------------------------
 *
 * A stored reference is a URL, and the asset is a path within the public bucket.
 * They are matched by *suffix*, not by equality, because the same asset can be
 * referred to as a bare path, a full project URL, or a path with a leading slash.
 * Matching on the object path as a suffix handles all three and cannot match a
 * different asset, since the path includes the folder and the generated name.
 */

export type MediaReference = {
  /** A human label for where the reference lives, e.g. "Page: Shipping". */
  where: string;
  /** The stored value that points at the asset. */
  value: string;
};

/**
 * Whether `value` points at the object at `storagePath`.
 *
 * The comparison strips a query string and any leading slash, then asks whether
 * the result ends with the path. `hero.jpg` does not match `og/hero.jpg`'s
 * sibling `other-hero.jpg` incorrectly because the path segment boundary is
 * included: the match is against `/` + path.
 */
export function referencesObject(value: string | null | undefined, storagePath: string): boolean {
  if (!value) return false;
  const cleanValue = (value.split('?')[0] ?? '').replace(/\/+$/, '');
  const cleanPath = storagePath.replace(/^\/+/, '');
  if (!cleanPath) return false;
  return cleanUrlEndsWith(cleanValue, cleanPath);
}

function cleanUrlEndsWith(url: string, path: string): boolean {
  // Compare the final segments so a project URL, a relative path and a leading
  // slash all match the same object, and a path that merely ends in the same
  // filename does not.
  return url.endsWith(`/${path}`) || url === path;
}

/** Whether any of `references` points at the object. */
export function isReferenced(storagePath: string, references: readonly MediaReference[]): boolean {
  return references.some((reference) => referencesObject(reference.value, storagePath));
}

/** The references that point at the object, for the message shown on refusal. */
export function referencesFor(
  storagePath: string,
  references: readonly MediaReference[],
): MediaReference[] {
  return references.filter((reference) => referencesObject(reference.value, storagePath));
}

/** The message an editor sees when a delete is refused. */
export function describeReferences(references: readonly MediaReference[]): string {
  const places = [...new Set(references.map((reference) => reference.where))];
  if (places.length === 0) return '';
  if (places.length === 1) return `This image is still used by ${places[0]}.`;
  return `This image is still used by ${places.slice(0, 3).join(', ')}${places.length > 3 ? ` and ${places.length - 3} more` : ''}.`;
}

/**
 * Every stored reference in a set of content rows.
 *
 * The caller reads the rows; this turns them into the list the check needs. It is
 * separated from the query so it can be tested without a database, which is the
 * only way to cover a reference in a page body block without seeding one.
 */
export function collectMediaReferences(input: {
  products?: { title: string; ogImageUrl: string | null }[];
  pages?: { title: string; heroImageUrl: string | null; bodyText: string | null }[];
  sections?: { sectionKey: string; imageUrl: string | null }[];
  settings?: { logoUrl: string | null } | null;
  navigation?: { label: string; href: string }[];
}): MediaReference[] {
  const references: MediaReference[] = [];

  for (const product of input.products ?? []) {
    if (product.ogImageUrl) {
      references.push({ where: `the product "${product.title}"`, value: product.ogImageUrl });
    }
  }

  for (const page of input.pages ?? []) {
    if (page.heroImageUrl) {
      references.push({ where: `the page "${page.title}"`, value: page.heroImageUrl });
    }
    // A page body block may carry an image URL. The blocks are stored as JSON, so
    // the URL is found by scanning the serialised text rather than by walking a
    // typed tree — a new block type would otherwise silently escape the check.
    if (page.bodyText) {
      for (const url of imageUrlsInJson(page.bodyText)) {
        references.push({ where: `the page "${page.title}"`, value: url });
      }
    }
  }

  for (const section of input.sections ?? []) {
    if (section.imageUrl) {
      references.push({
        where: `the homepage section "${section.sectionKey}"`,
        value: section.imageUrl,
      });
    }
  }

  if (input.settings?.logoUrl) {
    references.push({ where: 'the site logo', value: input.settings.logoUrl });
  }

  for (const item of input.navigation ?? []) {
    // A navigation href is a destination, not an image, but a media URL can be a
    // legitimate destination for a "download our catalogue" link, so it is
    // checked too rather than assumed away.
    if (/\.(jpe?g|png|webp|avif|gif)(\?|$)/i.test(item.href)) {
      references.push({ where: `the navigation link "${item.label}"`, value: item.href });
    }
  }

  return references;
}

/** Image-looking URLs in a JSON document. Tolerant of malformed input. */
function imageUrlsInJson(text: string): string[] {
  const matches = text.match(/https?:\/\/[^"'\s\\]+/g) ?? [];
  return matches.filter((url) => /\.(jpe?g|png|webp|avif|gif)(\?|$)/i.test(url));
}
