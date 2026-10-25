import type { AvailabilityWindow } from '@/server/repositories/service-repository';

/**
 * Turning availability windows into bookable slots.
 *
 * -----------------------------------------------------------------------------
 * THE CLIENT ONLY OFFERS WHAT THE DATABASE WILL ACCEPT
 * -----------------------------------------------------------------------------
 *
 * `request_appointment` refuses a time that is not on a slot boundary inside an
 * active window, and the unique index refuses one another live appointment holds.
 * This module generates exactly those boundaries so the customer is offered real
 * slots rather than free-text times that would be rejected on submit.
 *
 * It is a convenience, not a boundary: a crafted request naming an arbitrary time
 * still meets the database's check, and fails there.
 *
 * -----------------------------------------------------------------------------
 * WHY SLOTS ARE GENERATED IN THE BROWSER'S LOCAL TIME
 * -----------------------------------------------------------------------------
 *
 * A showroom's opening hours are local to the showroom. The windows are stored as
 * `time` values with no zone, and `request_appointment` compares the requested
 * timestamp's *local* time against them, so the client must build the instant from
 * the same local wall-clock reading. Generating them in UTC would offer 10:00 UTC
 * to a visitor in a UTC+2 city as their 12:00, and the two would disagree.
 */

export type BookableSlot = {
  /** The ISO instant to submit. */
  value: string;
  /** The wall-clock label to show, e.g. "14:00". */
  label: string;
  /** The day this slot belongs to, for grouping. */
  dayKey: string;
  /** The purpose the window is restricted to, or `null` for any purpose. */
  purpose: string | null;
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

/** Parse `HH:MM:SS` into hours and minutes. */
function parseTime(value: string): { hours: number; minutes: number } {
  const [h, m] = value.split(':');
  return { hours: Number(h), minutes: Number(m) };
}

/**
 * The slots for the next `days` days that fall inside an active window.
 *
 * Past slots are dropped: a customer cannot book a time that has already gone,
 * and offering one would produce a rejection the form could have avoided.
 *
 * Every window is included, and each slot carries the purpose its window is
 * restricted to. The form filters by the chosen purpose client-side, so changing
 * the purpose does not need a round trip. Passing a `purpose` narrows the result
 * for callers that only ever want one flow.
 */
export function buildBookableSlots(
  windows: AvailabilityWindow[],
  purpose?: string,
  days = 21,
  now: Date = new Date(),
): BookableSlot[] {
  const applicable = windows.filter(
    (window) => purpose === undefined || window.purpose === null || window.purpose === purpose,
  );
  if (applicable.length === 0) return [];

  const slots: BookableSlot[] = [];

  for (let offset = 0; offset < days; offset += 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const dayOfWeek = day.getDay();

    for (const window of applicable) {
      if (window.dayOfWeek !== dayOfWeek) continue;

      const start = parseTime(window.startTime);
      const end = parseTime(window.endTime);
      const startMinutes = start.hours * 60 + start.minutes;
      const endMinutes = end.hours * 60 + end.minutes;

      for (let minute = startMinutes; minute < endMinutes; minute += window.slotMinutes) {
        const slot = new Date(
          day.getFullYear(),
          day.getMonth(),
          day.getDate(),
          Math.floor(minute / 60),
          minute % 60,
        );

        if (slot.getTime() <= now.getTime()) continue;

        const dayKey = `${slot.getFullYear()}-${pad(slot.getMonth() + 1)}-${pad(slot.getDate())}`;
        slots.push({
          value: slot.toISOString(),
          label: `${pad(slot.getHours())}:${pad(slot.getMinutes())}`,
          dayKey,
          purpose: window.purpose,
        });
      }
    }
  }

  return slots.sort((a, b) => (a.value < b.value ? -1 : 1));
}

/** A readable label for a day group, e.g. "Tuesday 21 October". */
export function dayLabel(dayKey: string): string {
  const [year, month, day] = dayKey.split('-').map(Number);
  const date = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  return `${DAY_NAMES[date.getDay()]} ${day} ${date.toLocaleString('en-GB', { month: 'long' })}`;
}
