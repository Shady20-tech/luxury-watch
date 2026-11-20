import type { Metadata } from 'next';

import { TestimonialEditor } from '@/components/admin/content-editors';
import { AdminPageHeader } from '@/components/admin/ui';
import { noIndexMetadata } from '@/lib/seo/metadata';
import { fetchAdminTestimonials } from '@/server/repositories/admin-content-repository';
import { requirePermission } from '@/server/services/admin-authorization';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = noIndexMetadata('Testimonials · Content · Administration');

export default async function AdminTestimonialsPage() {
  await requirePermission('content.read');
  const testimonials = await fetchAdminTestimonials();

  return (
    <div>
      <AdminPageHeader
        title="Testimonials"
        description="Quotes shown on the homepage. Only a quote a customer actually gave."
      />
      <TestimonialEditor testimonials={testimonials} />
    </div>
  );
}
