/**
 * The product name without the brand prefix the card already shows.
 *
 * The card prints the brand as its own eyebrow line, so a title that begins
 * with the brand reads "Patek Philippe / Patek Philippe Cubitus …". Every
 * seeded title begins that way, and the admin form's placeholder invites the
 * same shape, so this is the common case rather than an edge case. Strip the
 * prefix only when it is followed by a separator, so a brand whose name is a
 * prefix of a model word ("Rolex" / "Rolexford") is left alone.
 */
export function titleWithoutBrand(title: string, brandName: string | null): string {
  if (!brandName) return title;

  const trimmed = title.trim();
  const brand = brandName.trim();
  if (!trimmed.toLowerCase().startsWith(brand.toLowerCase())) return trimmed;

  const rest = trimmed.slice(brand.length);

  // A brand may only be removed at a word boundary. `Rolexford` starts with
  // `Rolex` and must keep it, so the remainder has to begin with whitespace or
  // a separator rather than another letter.
  if (!/^[\s\-–—·:,()]/.test(rest)) return trimmed;

  const stripped = rest.replace(/^[\s\-–—·:,()]+/, '');
  return stripped.length > 0 ? stripped : trimmed;
}
