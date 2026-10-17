import type { Metadata } from 'next';

import { JsonLd } from '@/components/seo/json-ld';
import { getEnvReport, getPublicEnv } from '@/lib/env';
import { getServerEnvReport } from '@/lib/env.server';
import { buildMetadata } from '@/lib/seo/metadata';
import { breadcrumbSchema } from '@/lib/seo/schema';

export const metadata: Metadata = buildMetadata({
  title: `${getPublicEnv().siteName} — Luxury Watches`,
  description:
    'A curated luxury watch storefront. Browse timepieces, request pricing and availability, and arrange payment directly with the boutique.',
  path: '/',
});

/**
 * Phase 1 home page.
 *
 * This is deliberately a real status page rather than a mock storefront. The
 * brief for Phase 1 forbids inventing product data to make the site look
 * finished, so instead the page reports the genuine configuration state of the
 * application. It will be replaced by the database-driven home page in Phase 5.
 */
export default function HomePage() {
  const env = getPublicEnv();
  const publicReport = getEnvReport();
  const serverReport = getServerEnvReport();

  const configuration = [
    {
      label: 'Supabase connection',
      ready: Boolean(env.supabaseUrl && env.supabaseAnonKey),
      detail: 'Database, authentication and storage for the catalogue and order requests.',
    },
    {
      label: 'Privileged server access',
      ready: serverReport.serviceRoleConfigured,
      detail: 'Server-only key used by administration and sitemap generation.',
    },
    {
      label: 'Transactional email',
      ready: serverReport.emailConfigured,
      detail: 'Resend, used for order-request and enquiry notifications.',
    },
    {
      label: 'Canonical site URL',
      ready: Boolean(process.env.NEXT_PUBLIC_SITE_URL),
      detail: 'Used for canonical links, the sitemap and email links.',
    },
  ];

  return (
    <main id="main-content" className="flex-1">
      <section className="border-border border-b">
        <div className="container-page py-20 sm:py-28">
          <p className="text-accent-text text-sm font-semibold tracking-[0.2em] uppercase">
            Foundation release
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl sm:text-5xl lg:text-6xl">
            A luxury watch storefront, built on real data
          </h1>
          <p className="text-foreground-muted mt-6 max-w-prose text-lg">
            The application foundation is in place: typed configuration, database and authentication
            boundaries, security headers, error handling, structured logging and the SEO layer. The
            catalogue arrives in Phase 5, and every product will come from the database — none are
            hardcoded.
          </p>

          <dl className="mt-12 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Order handling', 'Manual, reviewed by an administrator'],
              ['Online payment', 'Not offered — payment is arranged offline'],
              ['Pricing', 'Published price or price on request'],
              ['Deployment', 'Vercel, with Supabase and Resend'],
            ].map(([term, description]) => (
              <div key={term} className="border-border border-t pt-4">
                <dt className="text-accent-text text-xs font-semibold tracking-[0.15em] uppercase">
                  {term}
                </dt>
                <dd className="text-foreground-muted mt-2 text-sm">{description}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section aria-labelledby="configuration-heading" className="border-border border-b">
        <div className="container-page py-16 sm:py-20">
          <h2 id="configuration-heading" className="text-2xl sm:text-3xl">
            Configuration status
          </h2>
          <p className="text-foreground-muted mt-3 max-w-prose">
            Each integration below is reported honestly. Items marked as pending need environment
            variables set in the Vercel dashboard before the corresponding feature can work.
          </p>

          <ul className="mt-10 grid gap-4 sm:grid-cols-2">
            {configuration.map((item) => (
              <li
                key={item.label}
                className="border-border bg-background-muted rounded-md border p-5"
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                      item.ready ? 'bg-success-600' : 'bg-warning-700'
                    }`}
                  />
                  <div>
                    <p className="font-semibold">
                      {item.label}
                      <span className="text-foreground-muted ml-2 text-xs font-normal">
                        {item.ready ? 'configured' : 'pending'}
                      </span>
                    </p>
                    <p className="text-foreground-muted mt-1 text-sm">{item.detail}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {publicReport.issues.length > 0 ? (
            <div className="border-warning-700/40 mt-8 rounded-md border p-5">
              <h3 className="text-base font-semibold">Configuration items to address</h3>
              <ul className="text-foreground-muted mt-3 space-y-2 text-sm">
                {publicReport.issues.map((issue) => (
                  <li key={issue.key}>
                    <code className="text-foreground font-mono text-xs">{issue.key}</code>
                    {' — '}
                    {issue.detail}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="next-heading">
        <div className="container-page py-16 sm:py-20">
          <h2 id="next-heading" className="text-2xl sm:text-3xl">
            What comes next
          </h2>
          <ol className="text-foreground-muted mt-6 max-w-prose list-inside list-decimal space-y-3">
            <li>Database schema, migrations and row-level security.</li>
            <li>Authentication, profiles and roles.</li>
            <li>Design system and the global header, navigation and footer.</li>
            <li>The database-driven catalogue, product pages and search.</li>
            <li>Cart and the manual order-request flow.</li>
          </ol>
        </div>
      </section>

      <JsonLd nodes={[breadcrumbSchema([{ name: 'Home', path: '/' }])]} />
    </main>
  );
}
