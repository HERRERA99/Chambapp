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
