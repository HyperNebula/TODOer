export function formatDate(iso: string | null): string {
  if (!iso) return "";
  try {
    // Date-only strings (YYYY-MM-DD) are parsed as UTC midnight by new Date(),
    // which shifts back a day in western timezones. Parse as local date instead.
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
    const d = dateOnly
      ? new Date(iso + "T00:00:00")   // local midnight
      : new Date(iso);
    return d.toLocaleDateString();
  } catch {
    return iso.slice(0, 10);
  }
}


export function formatMinutes(minutes: number | null): string {
  if (minutes === null) return "";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function parseMinutesInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const hm = trimmed.match(/^(\d+)\s*h(?:\s*(\d+)\s*m?)?$/i);
  if (hm) {
    return parseInt(hm[1], 10) * 60 + (hm[2] ? parseInt(hm[2], 10) : 0);
  }
  const num = parseInt(trimmed, 10);
  return Number.isNaN(num) ? null : num;
}
