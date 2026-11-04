export const MAX_NOTE_TITLE_LENGTH = 200;
export const MAX_NOTE_BYTES = 1_000_000;

export function titleFromFileName(name: string): string {
  const base = name.split(/[\\/]/).at(-1) ?? '';
  const title = base
    .replace(/(?:\.md)+$/i, '')
    .replace(/\p{Cc}/gu, '')
    .trim();
  return Array.from(title || 'Sin título')
    .slice(0, MAX_NOTE_TITLE_LENGTH)
    .join('');
}

export function noteFileName(title: string): string {
  let base = title
    .normalize('NFC')
    .trim()
    .replace(/(?:\.md)+$/i, '')
    .replace(/[<>:"/\\|?*]|\p{Cc}/gu, '-')
    .replace(/^[. ]+|[. ]+$/g, '');
  base =
    Array.from(base)
      .slice(0, 120)
      .join('')
      .replace(/[. ]+$/g, '') || 'nota';
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base)) base = `nota-${base}`;
  return `${base}.md`;
}

export async function readMarkdownFile(
  file: File,
): Promise<{ titulo: string; contenido_md: string }> {
  if (!/\.md$/i.test(file.name))
    throw new Error('Selecciona un archivo Markdown con extensión .md.');
  if (file.size > MAX_NOTE_BYTES) throw new Error('El archivo Markdown no puede superar 1 MB.');
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > MAX_NOTE_BYTES)
    throw new Error('El archivo Markdown no puede superar 1 MB.');
  let content: string;
  try {
    // Keep the original UTF-8 text, including its BOM and CRLF line endings.
    content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Error('El archivo debe estar guardado como texto UTF-8.');
  }
  if (content.includes('\0'))
    throw new Error('El archivo contiene datos binarios; selecciona texto Markdown.');
  return { titulo: titleFromFileName(file.name), contenido_md: content };
}

export function normalizeNoteSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es').trim();
}

export function noteMatchesSearch(
  note: { titulo: string; contenido_md: string },
  search: string,
): boolean {
  const query = normalizeNoteSearch(search);
  return !query || normalizeNoteSearch(`${note.titulo}\n${note.contenido_md}`).includes(query);
}

type Scrollable = { scrollTop: number; scrollHeight: number; clientHeight: number };

/** Scroll position for `target` matching the proportional position of `source`. */
export function syncScrollTarget(source: Scrollable, target: Scrollable): number {
  const sourceRange = source.scrollHeight - source.clientHeight;
  const targetRange = target.scrollHeight - target.clientHeight;
  if (sourceRange <= 0 || targetRange <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, source.scrollTop / sourceRange));
  return Math.round(ratio * targetRange);
}

export type ExcerptPart = { text: string; match: boolean };

/**
 * Short excerpt of the note body for the library and search suggestions.
 * With a search that matches the body, the excerpt is centred on the first match
 * and the matched text is marked; otherwise it is the start of the body.
 */
export function noteSearchExcerpt(content: string, search: string, length = 100): ExcerptPart[] {
  const text = content.replace(/\s+/g, ' ').trim();
  const query = normalizeNoteSearch(search);
  const found = query ? findNormalized(text, query) : null;
  if (!found)
    return text ? [{ text: Array.from(text).slice(0, length).join(''), match: false }] : [];
  const [start, end] = found;
  const room = Math.max(0, length - (end - start));
  let from = Math.max(0, start - Math.floor(room / 3));
  let to = Math.min(text.length, end + room - (start - from));
  // Do not cut a surrogate pair in half.
  if (from > 0 && /[\uDC00-\uDFFF]/.test(text[from] ?? '')) from -= 1;
  if (to < text.length && /[\uDC00-\uDFFF]/.test(text[to] ?? '')) to += 1;
  const parts: ExcerptPart[] = [];
  const before = text.slice(from, start);
  if (from > 0 || before) parts.push({ text: `${from > 0 ? '…' : ''}${before}`, match: false });
  parts.push({ text: text.slice(start, end), match: true });
  const after = text.slice(end, to);
  if (after || to < text.length)
    parts.push({ text: `${after}${to < text.length ? '…' : ''}`, match: false });
  return parts.filter((part) => part.text);
}

/** Range in the original text whose normalized form starts with `query`. */
function findNormalized(text: string, query: string): [number, number] | null {
  // Map each normalized character back to its original UTF-16 index.
  let normalized = '';
  const origin: number[] = [];
  let index = 0;
  for (const char of text) {
    const folded = normalizeNoteSearch(char) || (char.trim() ? '' : ' ');
    for (const unit of folded) {
      normalized += unit;
      for (let i = 0; i < unit.length; i += 1) origin.push(index);
    }
    index += char.length;
  }
  const at = normalized.indexOf(query);
  if (at < 0) return null;
  const last = at + query.length - 1;
  const lastOrigin = origin[last] ?? 0;
  const lastChar = String.fromCodePoint(text.codePointAt(lastOrigin) ?? 0);
  return [origin[at] ?? 0, lastOrigin + lastChar.length];
}
