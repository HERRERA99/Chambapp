import type { Profile } from './models';

export type ImputationThresholds = {
  verdeDesde: number;
  ambarDesde: number;
  maximo: number;
};

const defaults: ImputationThresholds = { verdeDesde: 90, ambarDesde: 85, maximo: 100 };

export function validImputationThresholds(value: ImputationThresholds) {
  const { ambarDesde, verdeDesde, maximo } = value;
  return 0 < ambarDesde && ambarDesde < verdeDesde && verdeDesde <= maximo && maximo <= 200;
}

export function readImputationThresholds(preferences: Profile['preferencias']) {
  const value = preferences.umbrales_imputacion;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const { verdeDesde, ambarDesde, maximo } = value;
    if (
      typeof verdeDesde === 'number' &&
      typeof ambarDesde === 'number' &&
      typeof maximo === 'number'
    ) {
      const thresholds = { verdeDesde, ambarDesde, maximo };
      if (validImputationThresholds(thresholds)) return thresholds;
    }
  }
  return { ...defaults };
}
