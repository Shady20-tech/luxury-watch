'use client';

import { X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Announcement } from '@/lib/navigation/types';

const DISMISS_KEY = 'lw:announcement-dismissed';
const ROTATE_MS = 6000;

/**
 * Announcement bar.
 *
 * Messages come from the `announcements` table, already filtered to the active
 * window by RLS. Behaviours that matter:
 *
 *  - **Dismissal is remembered per message**, keyed by id, so dismissing one
 *    announcement does not hide a different message published later.
 *  - **Rotation pauses** on hover and on keyboard focus, so a message cannot
 *    disappear mid-read, and it does not rotate at all when the visitor prefers
 *    reduced motion — a carousel that moves on its own is exactly what that
 *    preference is asking to stop.
 *  - The bar is `role="region"` with a label, not `role="alert"`; it is
 *    promotional, not urgent.
 */
export function AnnouncementBar({ announcements }: { announcements: Announcement[] }) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [mounted, setMounted] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Read persisted dismissals after mount so the server and client markup match
  // on first paint (no hydration mismatch from a client-only value).
  useEffect(() => {
    setMounted(true);
    try {
      const raw = window.localStorage.getItem(DISMISS_KEY);
      if (raw) setDismissed(JSON.parse(raw) as string[]);
    } catch {
      // A blocked or full localStorage must not break the page.
    }
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduceMotion(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const visible = announcements.filter((item) => !dismissed.includes(item.id));
  const shouldRotate = visible.length > 1 && !paused && !reduceMotion;

  useEffect(() => {
    if (!shouldRotate) return;
    timer.current = setInterval(() => {
      setIndex((current) => (current + 1) % visible.length);
    }, ROTATE_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [shouldRotate, visible.length]);

  const dismiss = useCallback((id: string) => {
    setDismissed((current) => {
      const next = [...current, id];
      try {
        window.localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
      } catch {
        // Persisting is best-effort; the dismissal still applies this session.
      }
      return next;
    });
  }, []);

  if (visible.length === 0) return null;

  const current = visible[index % visible.length];
  if (!current) return null;

  return (
    <div
      role="region"
      aria-label="Announcements"
      className="bg-ink-950 text-surface-0 relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="container-page flex min-h-9 items-center justify-center gap-3 py-2">
        {/* `aria-live` only after mount, so the first message is not announced
            twice, and `polite` so it never interrupts. */}
        <p
          className="text-center text-xs sm:text-sm"
          aria-live={mounted && shouldRotate ? 'polite' : 'off'}
        >
          {current.message}
          {current.linkUrl ? (
            <>
              {' '}
              <Link
                href={current.linkUrl}
                className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300 underline underline-offset-2"
              >
                {current.linkLabel ?? 'Learn more'}
              </Link>
            </>
          ) : null}
        </p>

        {visible.length > 1 ? (
          <span className="text-surface-200/70 hidden text-[0.625rem] tracking-widest sm:inline">
            {(index % visible.length) + 1}/{visible.length}
          </span>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => dismiss(current.id)}
        className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300 absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-1.5 hover:bg-white/10"
        aria-label="Dismiss announcement"
      >
        <X aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  );
}
