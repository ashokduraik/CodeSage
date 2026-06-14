import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges conditional class names and de-duplicates conflicting Tailwind classes.
 * Combines `clsx` (conditional joining) with `tailwind-merge` (last-wins resolution).
 * @param inputs - Class values: strings, arrays, or conditional objects.
 * @returns A single, conflict-resolved class-name string.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
