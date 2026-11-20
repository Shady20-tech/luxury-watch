import type { Metadata } from 'next';

import {
  AdminPageHeader,
  AdminTable,
  AdminTd,
  AdminTh,
  EmptyState,
  StatusPill,
} from '@/components/admin/ui';
import { formatAdminDateTime } from '@/lib/admin/format';
import { noIndexMetadata } from '@/lib/seo/metadata';
import {
  listInquiries,
  listProductQuestions,
} from '@/server/repositories/admin-service-repository';
import { requirePermission } from '@/server/services/admin-authorization';

/**
 * Enquiries and product questions.
 *
 * The two are shown together because they are the same job — reading what a
 * customer asked and answering it — and splitting them across two pages would
 * mean checking two places to find out whether anyone is waiting.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = noIndexMetadata('Enquiries · Administration');

export default async function AdminInquiriesPage() {
  await requirePermission('inquiries.read');

  const [inquiries, questions] = await Promise.all([listInquiries(), listProductQuestions()]);
  const unanswered = questions.filter((q) => q.answer === null);

  return (
    <div>
      <AdminPageHeader
        title="Enquiries"
        description="General enquiries and questions asked about specific pieces. Answering is done by email; this page is the queue."
      />

      <section aria-labelledby="questions-heading">
        <h2 id="questions-heading" className="mb-3 text-lg">
          Product questions
          {unanswered.length > 0 ? (
            <span className="text-foreground-muted ml-2 text-sm font-normal tabular-nums">
              {unanswered.length} unanswered
            </span>
          ) : null}
        </h2>

        {questions.length === 0 ? (
          <EmptyState title="No product questions yet" />
        ) : (
          <AdminTable caption="Product questions">
            <thead>
              <tr>
                <AdminTh>Question</AdminTh>
                <AdminTh>Answer</AdminTh>
                <AdminTh>Asked</AdminTh>
              </tr>
            </thead>
            <tbody>
              {questions.map((question) => (
                <tr key={question.id}>
                  <AdminTd className="max-w-md">
                    <p className="whitespace-pre-line">{question.question}</p>
                  </AdminTd>
                  <AdminTd className="max-w-md">
                    {question.answer ? (
                      <p className="text-foreground-muted whitespace-pre-line">{question.answer}</p>
                    ) : (
                      <span className="text-gold-900 text-xs font-medium">Unanswered</span>
                    )}
                  </AdminTd>
                  <AdminTd className="text-foreground-muted text-xs whitespace-nowrap tabular-nums">
                    {formatAdminDateTime(question.createdAt)}
                  </AdminTd>
                </tr>
              ))}
            </tbody>
          </AdminTable>
        )}
      </section>

      <section aria-labelledby="inquiries-heading" className="mt-10">
        <h2 id="inquiries-heading" className="mb-3 text-lg">
          Enquiries
        </h2>

        {inquiries.length === 0 ? (
          <EmptyState title="No enquiries yet" />
        ) : (
          <AdminTable caption="Enquiries">
            <thead>
              <tr>
                <AdminTh>From</AdminTh>
                <AdminTh>Type</AdminTh>
                <AdminTh>Status</AdminTh>
                <AdminTh>Message</AdminTh>
                <AdminTh>Received</AdminTh>
              </tr>
            </thead>
            <tbody>
              {inquiries.map((inquiry) => (
                <tr key={inquiry.id}>
                  <AdminTd>
                    <span className="block font-medium">{inquiry.name}</span>
                    <span className="text-foreground-muted block text-xs">{inquiry.email}</span>
                    <span className="text-foreground-muted block font-mono text-xs">
                      {inquiry.reference}
                    </span>
                  </AdminTd>
                  <AdminTd className="text-xs">{inquiry.type.replace(/_/g, ' ')}</AdminTd>
                  <AdminTd>
                    <StatusPill status={inquiry.status} />
                  </AdminTd>
                  <AdminTd className="max-w-md">
                    <p className="line-clamp-3 whitespace-pre-line">{inquiry.message}</p>
                  </AdminTd>
                  <AdminTd className="text-foreground-muted text-xs whitespace-nowrap tabular-nums">
                    {formatAdminDateTime(inquiry.createdAt)}
                  </AdminTd>
                </tr>
              ))}
            </tbody>
          </AdminTable>
        )}
      </section>
    </div>
  );
}
