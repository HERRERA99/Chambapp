import { createClient } from "@supabase/supabase-js";
import { DateTime } from "luxon";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co",
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "placeholder",
);
export const configured = Boolean(
  import.meta.env.VITE_SUPABASE_URL &&
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);
export const today = (zone = "Europe/Madrid") =>
  DateTime.now().setZone(zone).toISODate()!;
export const localInput = (iso?: string | null, zone = "Europe/Madrid") =>
  iso ? DateTime.fromISO(iso).setZone(zone).toFormat("yyyy-MM-dd'T'HH:mm") : "";
export const toInstant = (value: string, zone: string) =>
  DateTime.fromISO(value, { zone }).toUTC().toISO()!;
export const dateLabel = (
  date: string,
  zone = "Europe/Madrid",
  options?: Intl.DateTimeFormatOptions,
) =>
  new Intl.DateTimeFormat("es-ES", {
    timeZone: zone,
    day: "numeric",
    month: "short",
    ...options,
  }).format(DateTime.fromISO(date, { zone }).toJSDate());
export const seconds = (start: string, end?: string | null, now = Date.now()) =>
  Math.max(
    0,
    Math.floor(((end ? Date.parse(end) : now) - Date.parse(start)) / 1000),
  );
export const duration = (value: number, showSeconds = false) => {
  const n = Math.max(0, Math.floor(value));
  return `${Math.floor(n / 3600)}:${String(Math.floor((n % 3600) / 60)).padStart(2, "0")}${showSeconds ? `:${String(n % 60).padStart(2, "0")}` : ""}`;
};
export const rounded = (value: number, increment: number) =>
  increment ? Math.ceil(value / (increment * 60)) * increment * 60 : value;
export const decimalHours = (value: number) =>
  (value / 3600).toLocaleString("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
export const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
export async function unwrap<R extends { data: unknown; error: { message: string } | null }>(
  request: PromiseLike<R>,
): Promise<R["data"]> {
  const { data, error } = await request;
  if (error) throw new Error(error.message);
  return data;
}
