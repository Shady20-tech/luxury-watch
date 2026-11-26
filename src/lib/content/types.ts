/**
 * The structured content a CMS page is built from.
 *
 * -----------------------------------------------------------------------------
 * WHY BLOCKS AND NOT HTML
 * -----------------------------------------------------------------------------
 *
 * `pages.content` is `jsonb`, not a string of markup. The renderer decides which
 * element each block becomes, so a stored page cannot inject a script tag or an
 * arbitrary attribute: the worst a bad row can do is render nothing, because an
 * unknown block type is dropped rather than passed through.
 *
 * -----------------------------------------------------------------------------
 * UNKNOWN BLOCKS ARE DROPPED, NOT GUESSED
 * -----------------------------------------------------------------------------
 *
 * `parsePageBlocks` narrows each entry against the union below and discards
 * anything that does not match. That is what lets a future block type be added by
 * a newer admin without an older deploy rendering it wrongly — it simply is not
 * shown until the renderer knows about it.
 */

export type PageBlock =
  | { type: 'heading'; text: string; level?: 2 | 3 }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[]; ordered?: boolean }
  | { type: 'callout'; text: string; tone?: 'info' | 'warning' }
  | { type: 'figure'; src: string; caption?: string }
  | { type: 'faq'; items: { question: string; answer: string }[] };

export type PageContent = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  heroImageUrl: string | null;
  blocks: PageBlock[];
  seoTitle: string | null;
  seoDescription: string | null;
  updatedAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** Narrow one raw entry into a known block, or `null` if it is not one. */
function parseBlock(raw: unknown): PageBlock | null {
  if (!isRecord(raw)) return null;

  const type = raw.type;

  if (type === 'heading') {
    const text = asString(raw.text);
    if (!text) return null;
    const level = raw.level === 3 ? 3 : 2;
    return { type: 'heading', text, level };
  }

  if (type === 'paragraph') {
    const text = asString(raw.text);
    return text ? { type: 'paragraph', text } : null;
  }

  if (type === 'list') {
    if (!Array.isArray(raw.items)) return null;
    const items = raw.items.map(asString).filter((item): item is string => item !== null);
    if (items.length === 0) return null;
    return { type: 'list', items, ordered: raw.ordered === true };
  }

  if (type === 'callout') {
    const text = asString(raw.text);
    if (!text) return null;
    return { type: 'callout', text, tone: raw.tone === 'warning' ? 'warning' : 'info' };
  }

  if (type === 'figure') {
    // Only the path is stored. The alt text, credit, licence and dimensions
    // live in the site-photography registry and are resolved at render time, so
    // a figure block cannot carry an unattributed image: a path the registry
    // does not know renders nothing at all.
    const src = asString(raw.src);
    if (!src) return null;
    const caption = asString(raw.caption) ?? undefined;
    return { type: 'figure', src, caption };
  }

  if (type === 'faq') {
    if (!Array.isArray(raw.items)) return null;
    const items = raw.items
      .filter(isRecord)
      .map((item) => ({ question: asString(item.question), answer: asString(item.answer) }))
      .filter(
        (item): item is { question: string; answer: string } =>
          item.question !== null && item.answer !== null,
      );
    return items.length > 0 ? { type: 'faq', items } : null;
  }

  return null;
}

/** Narrow the stored `content` column into blocks, dropping anything unknown. */
export function parsePageBlocks(raw: unknown): PageBlock[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parseBlock).filter((block): block is PageBlock => block !== null);
}
