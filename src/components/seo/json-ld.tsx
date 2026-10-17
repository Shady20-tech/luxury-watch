import { jsonLdGraph } from '@/lib/seo/schema';

/**
 * Renders a JSON-LD document.
 *
 * The serialised JSON is escaped so a string value can never break out of the
 * script element: `<` becomes `\u003c`, which stops a `</script>` sequence
 * appearing inside data sourced from the database. React's
 * `dangerouslySetInnerHTML` is safe here because the payload is a JSON
 * serialisation of trusted builders, with the dangerous characters escaped.
 */
export function JsonLd({ nodes }: { nodes: Parameters<typeof jsonLdGraph>[0] }) {
  const graph = jsonLdGraph(nodes);

  if (graph['@graph'].length === 0) return null;

  const json = JSON.stringify(graph).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
