'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { markNotificationsReadAction } from '@/server/actions/notification-actions';

/**
 * "Mark all as read", for the notifications page.
 *
 * A real button, not a link: it performs an action rather than navigating, and
 * `aria-pressed`/`aria-current` do not apply. The label states the whole effect
 * so a speech-input user can say what they see (WCAG 2.5.3).
 *
 * The page re-renders from the server after the action because the action
 * revalidates `/account/notifications`; `router.refresh()` makes that visible
 * without a full navigation.
 */
export function MarkAllReadButton({ count }: { count: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (count === 0) return null;

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await markNotificationsReadAction(null);
            if (result.status === 'error') {
              setError(result.message ?? 'That did not work. Please try again.');
              return;
            }
            router.refresh();
          });
        }}
      >
        {pending ? 'Marking…' : `Mark all ${count} as read`}
      </Button>
      {error ? (
        <p role="alert" className="text-danger-600 text-xs font-medium">
          {error}
        </p>
      ) : null}
    </div>
  );
}
