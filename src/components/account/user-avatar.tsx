import { cn } from '@/lib/utils';

/**
 * A person's avatar, or their initials when they have no photograph.
 *
 * -----------------------------------------------------------------------------
 * WHY THE FALLBACK IS INITIALS AND NOT AN ICON
 * -----------------------------------------------------------------------------
 *
 * A generic person glyph in a list of staff is indistinguishable from every other
 * row, which defeats the point of an avatar. Initials are derived from the name
 * the row already shows, so they add a visual anchor without claiming to be a
 * photograph.
 *
 * When there is neither a photo nor a name, the fallback is a dash rather than a
 * blank circle: an empty circle reads as a broken image, which is exactly the
 * impression this component exists to avoid.
 *
 * -----------------------------------------------------------------------------
 * WHY A PLAIN `<img>`
 * -----------------------------------------------------------------------------
 *
 * The URL is a public Supabase object at a fixed size. `next/image` would add a
 * proxy round trip and cache a variant per size for an image that is already
 * small, and the URL changes on every upload so the optimiser cache would never
 * be reused. The dimensions are fixed by the `size` prop, so the layout does not
 * shift when the image loads.
 */
export function UserAvatar({
  url,
  name,
  size = 'md',
  className,
}: {
  url: string | null;
  name: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const initials = (name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  const dimensions = {
    sm: 'h-7 w-7 text-[0.75rem]',
    md: 'h-10 w-10 text-xs',
    lg: 'h-20 w-20 text-xl',
  }[size];

  return (
    <span
      className={cn(
        'border-line-300 bg-surface-100 relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border',
        dimensions,
        className,
      )}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden="true" className="text-ink-500 font-medium">
          {initials || '—'}
        </span>
      )}
    </span>
  );
}
