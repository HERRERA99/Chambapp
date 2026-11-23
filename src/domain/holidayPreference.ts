import type { Profile } from './models';

export type HolidayPreference = {
  pais: string;
  region: string;
};

export function validHolidayCountry(country: string) {
  return /^[A-Z]{2}$/.test(country);
}

export function validHolidayPreference({ pais, region }: HolidayPreference) {
  return (
    validHolidayCountry(pais) &&
    (region === '' || (region.startsWith(`${pais}-`) && /^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(region)))
  );
}

export function readHolidayPreference(preferences: Profile['preferencias']) {
  const value = preferences.festivos;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const { pais, region } = value;
    if (typeof pais === 'string' && typeof region === 'string') {
      const preference = { pais, region };
      if (validHolidayPreference(preference)) return preference;
    }
  }
  return null;
}
