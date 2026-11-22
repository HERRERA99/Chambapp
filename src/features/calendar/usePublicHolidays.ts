import { useQuery } from '@tanstack/react-query';
import { validHolidayCountry } from '../../domain/holidayPreference';
import { fetchHolidays } from './holidayApi';

const spanishRegions: Record<string, string> = {
  'ES-AN': 'Andalucía',
  'ES-AR': 'Aragón',
  'ES-AS': 'Asturias',
  'ES-CB': 'Cantabria',
  'ES-CL': 'Castilla y León',
  'ES-CM': 'Castilla-La Mancha',
  'ES-CN': 'Canarias',
  'ES-CT': 'Cataluña',
  'ES-EX': 'Extremadura',
  'ES-GA': 'Galicia',
  'ES-IB': 'Illes Balears',
  'ES-MC': 'Región de Murcia',
  'ES-MD': 'Comunidad de Madrid',
  'ES-NC': 'Navarra',
  'ES-PV': 'País Vasco',
  'ES-RI': 'La Rioja',
  'ES-VC': 'Comunitat Valenciana',
  'ES-CE': 'Ceuta',
  'ES-ML': 'Melilla',
};

export function holidayRegionName(code: string) {
  return spanishRegions[code] ?? code;
}

export function usePublicHolidays(year: number, country: string, enabled = true) {
  const holidays = useQuery({
    queryKey: ['public-holidays', year, country],
    queryFn: ({ signal }) => fetchHolidays(year, country, signal),
    enabled: enabled && validHolidayCountry(country),
    retry: false,
    staleTime: 3600_000,
  });
  const regions = [...new Set(holidays.data?.flatMap((holiday) => holiday.counties ?? []))].sort();
  return { holidays, regions };
}
