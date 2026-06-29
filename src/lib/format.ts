export function formatDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso.slice(0, 10);
  }
}

export function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
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
