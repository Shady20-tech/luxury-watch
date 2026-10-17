import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge conditional class names and resolve Tailwind conflicts.
 *
 * `clsx` handles the conditional logic; `twMerge` resolves conflicts so a
 * caller-supplied `className` genuinely overrides a component default instead
 * of both classes being emitted and the winner depending on stylesheet order.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
