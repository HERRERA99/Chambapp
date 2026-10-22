export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export function parseJson(text: string): Json {
  if (!text.trim()) throw new Error('Pega un JSON para empezar.');
  if (text.length > 500_000) throw new Error('El límite es de 500.000 caracteres.');
  const value: Json = JSON.parse(text);
  let nodes = 0;
  function check(item: Json, depth: number) {
    if (++nodes > 5000 || depth > 60)
      throw new Error('El JSON supera 5.000 elementos o 60 niveles.');
    if (item !== null && typeof item === 'object')
      Object.values(item).forEach((v) => check(v, depth + 1));
  }
  check(value, 0);
  return value;
}
export function entries(value: Json): [string, Json][] {
  return value !== null && typeof value === 'object' ? Object.entries(value) : [];
}
export function summary(value: Json): string {
  return Array.isArray(value)
    ? `Array · ${value.length}`
    : value !== null && typeof value === 'object'
      ? `Objeto · ${Object.keys(value).length}`
      : JSON.stringify(value);
}
export type Difference = {
  path: string;
  kind: 'Añadido' | 'Eliminado' | 'Modificado';
  before?: Json;
  after?: Json;
};
export function compareJson(a: Json, b: Json): Difference[] {
  const result: Difference[] = [];
  function walk(left: Json, right: Json, path: string) {
    if (left === right) return;
    if (
      left !== null &&
      right !== null &&
      typeof left === 'object' &&
      typeof right === 'object' &&
      Array.isArray(left) === Array.isArray(right)
    ) {
      for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
        const p = `${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`;
        const l = (left as Record<string, Json>)[key];
        const r = (right as Record<string, Json>)[key];
        if (!Object.hasOwn(left, key)) result.push({ path: p, kind: 'Añadido', after: r });
        else if (!Object.hasOwn(right, key)) result.push({ path: p, kind: 'Eliminado', before: l });
        else walk(l!, r!, p);
      }
    } else result.push({ path: path || '/', kind: 'Modificado', before: left, after: right });
  }
  walk(a, b, '');
  return result;
}
