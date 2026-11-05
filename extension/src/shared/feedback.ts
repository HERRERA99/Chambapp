/**
 * Copies text and, after 30 s, clears the clipboard only if it can confirm the
 * clipboard still holds that same text (otherwise it leaves it alone). Works
 * while the popup stays open.
 */
export async function copySecret(text: string) {
  await navigator.clipboard.writeText(text);
  setTimeout(() => {
    void navigator.clipboard
      .readText()
      .then((current) => (current === text ? navigator.clipboard.writeText('') : undefined))
      .catch(() => undefined);
  }, 30_000);
}

export const errorMessage = (cause: unknown) =>
  cause instanceof Error ? cause.message : 'No se pudo completar la operación.';
