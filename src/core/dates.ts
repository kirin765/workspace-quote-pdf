/**
 * Timezone-safe ISO date helpers.
 *
 * Dates are plain `YYYY-MM-DD` strings. Day arithmetic uses UTC so it never
 * shifts across daylight-saving boundaries.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value.trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function addDaysIso(dateIso: string, days: number): string {
  const match = ISO_DATE.exec(dateIso.trim());
  if (!match || !Number.isInteger(days)) return dateIso;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function isoDateFromParts(year: number, month: number, day: number): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${String(year).padStart(4, "0")}-${pad(month)}-${pad(day)}`;
}
