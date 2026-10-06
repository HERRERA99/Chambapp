import { validDateRange } from '../../domain/calendar.ts';

export type PublicHoliday = {
  date: string;
  localName: string;
  countryCode: string;
  global: boolean;
  counties: string[] | null;
  types: string[];
};

export function parseHolidays(value: unknown, year: number, country: string): PublicHoliday[] {
  if (!Array.isArray(value) || value.length > 100)
    throw new Error('Respuesta de festivos inválida.');
  for (const item of value) {
    if (
      !item ||
      typeof item !== 'object' ||
      typeof item.date !== 'string' ||
      !validDateRange(item.date, item.date) ||
      !item.date.startsWith(`${year}-`) ||
      item.countryCode !== country ||
      typeof item.localName !== 'string' ||
      !item.localName.trim() ||
      item.localName.length > 200 ||
      typeof item.global !== 'boolean' ||
      !Array.isArray(item.types) ||
      !item.types.every((type: unknown) => typeof type === 'string') ||
      (item.counties !== null &&
        (!Array.isArray(item.counties) ||
          !item.counties.every((county: unknown) => typeof county === 'string')))
    ) {
      throw new Error('El servicio devolvió festivos incompletos. No se ha importado ningún dato.');
    }
  }
  return value as PublicHoliday[];
}

export function selectedHolidays(holidays: readonly PublicHoliday[], region: string) {
  const dates = new Map<string, string[]>();
  for (const holiday of holidays) {
    if (
      !holiday.types.includes('Public') ||
      (!holiday.global && !holiday.counties?.includes(region))
    )
      continue;
    const titles = dates.get(holiday.date) ?? [];
    if (!titles.includes(holiday.localName)) titles.push(holiday.localName);
    dates.set(holiday.date, titles);
  }
  return [...dates].map(([fecha, titles]) => ({ fecha, titulo: titles.join(' / ').slice(0, 200) }));
}

export async function fetchHolidays(year: number, country: string, signal: AbortSignal) {
  if (!Number.isInteger(year) || year < 1900 || year > 2100 || !/^[A-Z]{2}$/.test(country)) {
    throw new Error('Selecciona un año y un país válidos.');
  }
  const response = await fetch(
    `https://nagerholidays.com/api/v3/PublicHolidays/${year}/${country}`,
    { signal },
  );
  if (!response.ok)
    throw new Error('No se pudieron consultar los festivos. Puedes registrarlos manualmente.');
  return parseHolidays(await response.json(), year, country);
}
