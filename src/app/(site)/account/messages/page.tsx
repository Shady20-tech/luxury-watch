import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MessageSquare } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { noIndexMetadata } from '@/lib/seo/metadata';
import { fetchAccountThreads } from '@/server/repositories/account-repository';
import { getAccountAccess, loginPathFor } from '@/server/services/authorization-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = noIndexMetadata('Messages');

/**
 * The customer's messages.
 *
 * What appears here is the customer's own enquiry threads: what they wrote, and
 * the replies the team sent them. Internal notes are excluded twice over — the
 * query filters `is_internal = false`, and `inquiry_replies_select_own` refuses
 * the row to a customer regardless. A note the team wrote about a customer is
 * not something that customer is entitled to read, and showing it would be worse
 * than showing nothing.
 *
 * This deliberately does not use the `messages` table. That table is internal
 * staff messaging and is documented as never readable by a customer.
 *
 * There is no reply box. Sending a reply needs a write path with its own spam and
 * rate-limit story, and the contact form already carries that; offering a text
 * area that silently failed to send would be worse than pointing at the form that
 * works.
 */
export default async function AccountMessagesPage() {
  const access = await getAccountAccess();
  if (!access) redirect(loginPathFor('/account/messages'));

  const threads = await fetchAccountThreads(access.user.id);

  if (threads.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h2 className="text-xl">Messages</h2>
          <p className="text-foreground-muted mt-2 max-w-prose text-sm">
            Conversations with our team appear here.
          </p>
        </div>
        <EmptyState
          icon={MessageSquare}
          title="No messages yet"
          description="When you contact us about a piece or a service, our replies will appear here."
          action={
            <Link
              href="/contact"
              className="text-accent-text text-sm font-medium underline-offset-4 hover:underline"
            >
              Contact us
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl">Messages</h2>
        <p className="text-foreground-muted mt-2 max-w-prose text-sm">
          {threads.length} {threads.length === 1 ? 'conversation' : 'conversations'} with our team.
          To add to one, reply to the email we sent you or use the{' '}
          <Link href="/contact" className="text-accent-text underline-offset-4 hover:underline">
            contact form
          </Link>
          .
        </p>
      </div>

      <ul className="flex flex-col gap-4">
        {threads.map((thread) => (
          <li key={thread.id}>
            <article className="border-line-300 rounded-sm border p-5">
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold">{thread.subject}</h3>
                  <p className="text-foreground-muted mt-1 text-sm">
                    {thread.reference ? (
                      <span className="font-mono text-xs tracking-wide">{thread.reference} · </span>
                    ) : null}
                    {formatDate(thread.createdAt)}
                  </p>
                </div>
                <Badge variant={thread.status === 'closed' ? 'neutral' : 'accent'}>
                  {statusLabel(thread.status)}
                </Badge>
              </header>

              <p className="text-foreground-muted mt-4 max-w-prose text-sm whitespace-pre-line">
                {thread.message}
              </p>

              {thread.replies.length > 0 ? (
                <ol className="border-line-200 mt-4 flex flex-col gap-4 border-t pt-4">
                  {thread.replies.map((reply) => (
                    <li key={reply.id}>
                      <p className="text-foreground-muted text-xs font-medium tracking-wide uppercase">
                        {reply.fromStaff ? 'Our team' : 'You'} · {formatDate(reply.createdAt)}
                      </p>
                      <p className="text-foreground mt-1.5 max-w-prose text-sm whitespace-pre-line">
                        {reply.body}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-foreground-muted mt-4 text-sm">
                  We have not replied to this yet. We answer enquiries in the order they arrive.
                </p>
              )}
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(value));
}

function statusLabel(status: string): string {
  const words = status.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
