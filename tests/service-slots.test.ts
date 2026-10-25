import { describe, expect, it } from 'vitest';

import { buildBookableSlots, dayLabel } from '@/lib/service/slots';
import type { AvailabilityWindow } from '@/server/repositories/service-repository';

/**
 * Bookable-slot generation.
 *
 * `request_appointment` refuses a time that is not on a slot boundary inside an
 * active window, so this module has to produce exactly those boundaries or the
 * form offers times the database will reject. The tests therefore check the
 * boundaries, the local-time reading and the purpose filter, and each case is
 * driven with a fixed `now` so the result cannot depend on when the suite runs.
 */

function window(overrides: Partial<AvailabilityWindow> = {}): AvailabilityWindow {
  return {
    id: 'w1',
    dayOfWeek: 1, // Monday
    startTime: '10:00:00',
    endTime: '12:00:00',
    slotMinutes: 60,
    purpose: null,
    ...overrides,
  };
}

// A Monday at 09:00 local time. The generator works in local wall-clock, so the
// assertion is written against the same reading rather than a UTC literal.
const MONDAY_9AM = new Date(2026, 10, 2, 9, 0, 0);
const MONDAY_10AM = new Date(2026, 10, 2, 10, 0, 0);

describe('buildBookableSlots', () => {
  it('returns nothing when there are no windows', () => {
    expect(buildBookableSlots([], undefined, 21, MONDAY_9AM)).toEqual([]);
  });

  it('produces a slot on each boundary within the window', () => {
    const slots = buildBookableSlots([window()], undefined, 1, MONDAY_9AM);
    expect(slots.map((slot) => slot.label)).toEqual(['10:00', '11:00']);
  });

  it('does not offer a slot at the window end', () => {
    // 12:00 is the closing time, not a bookable start. Offering it would produce
    // a request the function rejects.
    const slots = buildBookableSlots([window()], undefined, 1, MONDAY_9AM);
    expect(slots.some((slot) => slot.label === '12:00')).toBe(false);
  });

  it('drops slots that have already passed', () => {
    const slots = buildBookableSlots([window()], undefined, 1, MONDAY_10AM);
    expect(slots.map((slot) => slot.label)).toEqual(['11:00']);
  });

  it('honours the slot length', () => {
    const slots = buildBookableSlots([window({ slotMinutes: 30 })], undefined, 1, MONDAY_9AM);
    expect(slots.map((slot) => slot.label)).toEqual(['10:00', '10:30', '11:00', '11:30']);
  });

  it('ignores a window on another day of the week', () => {
    const slots = buildBookableSlots([window({ dayOfWeek: 3 })], undefined, 1, MONDAY_9AM);
    expect(slots).toEqual([]);
  });

  it('labels the day group with the weekday and date', () => {
    const slots = buildBookableSlots([window()], undefined, 1, MONDAY_9AM);
    expect(slots[0]?.dayKey).toBe('2026-11-02');
    expect(dayLabel(slots[0]!.dayKey)).toBe('Monday 2 November');
  });

  it('builds the instant from local wall-clock, not UTC', () => {
    // The showroom's hours are local. A slot labelled 10:00 must be 10:00 where
    // the customer is, which is what `request_appointment` compares against.
    const slots = buildBookableSlots([window()], undefined, 1, MONDAY_9AM);
    const first = new Date(slots[0]!.value);
    expect(first.getHours()).toBe(10);
    expect(first.getMinutes()).toBe(0);
  });

  it('sorts the slots chronologically across days', () => {
    const slots = buildBookableSlots(
      [window({ dayOfWeek: 1 }), window({ id: 'w2', dayOfWeek: 2 })],
      undefined,
      3,
      MONDAY_9AM,
    );
    const values = slots.map((slot) => slot.value);
    expect([...values].sort()).toEqual(values);
  });

  it('carries the window purpose so the form can filter without a round trip', () => {
    const slots = buildBookableSlots([window({ purpose: 'repair' })], undefined, 1, MONDAY_9AM);
    expect(slots.every((slot) => slot.purpose === 'repair')).toBe(true);
  });

  it('narrows to one purpose while keeping unrestricted windows', () => {
    const windows = [
      window({ id: 'any', purpose: null }),
      window({ id: 'repair', purpose: 'repair' }),
      window({ id: 'sourcing', purpose: 'sourcing' }),
    ];
    const slots = buildBookableSlots(windows, 'repair', 1, MONDAY_9AM);
    const purposes = new Set(slots.map((slot) => slot.purpose));
    expect(purposes).toEqual(new Set([null, 'repair']));
  });

  it('excludes a purpose-restricted window from another flow', () => {
    const slots = buildBookableSlots([window({ purpose: 'sourcing' })], 'repair', 1, MONDAY_9AM);
    expect(slots).toEqual([]);
  });

  it('returns nothing when every window is restricted to another flow', () => {
    // An unrestricted window (purpose null) applies to every flow, so this case
    // needs a window that is explicitly restricted elsewhere.
    expect(buildBookableSlots([window({ purpose: 'sourcing' })], 'repair', 1, MONDAY_9AM)).toEqual(
      [],
    );
  });

  it('keeps an unrestricted window under any purpose filter', () => {
    const slots = buildBookableSlots([window({ purpose: null })], 'repair', 1, MONDAY_9AM);
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((slot) => slot.purpose === null)).toBe(true);
  });
});

describe('dayLabel', () => {
  it('renders the weekday, day and month', () => {
    expect(dayLabel('2026-11-02')).toBe('Monday 2 November');
  });

  it('falls back rather than throwing on a malformed key', () => {
    // A stored key that lost a segment must not crash the page that groups by it.
    expect(() => dayLabel('2026-11')).not.toThrow();
  });
});
