// Injected on demand (popup "Rellenar") into the top frame of the active tab.
// It only exposes a function; nothing runs until the worker calls it.

type FillResult = { username: boolean; password: boolean; insecure: boolean };

function visible(element: HTMLElement) {
  if (!element.isConnected) return false;
  const style = getComputedStyle(element);
  if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0)
    return false;
  const box = element.getBoundingClientRect();
  return box.width > 0 && box.height > 0;
}

function usable(input: HTMLInputElement) {
  return !input.disabled && !input.readOnly && visible(input);
}

function setValue(input: HTMLInputElement, value: string) {
  input.focus();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (setter) setter.call(input, value);
  else input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

const textTypes = ['', 'text', 'email', 'tel', 'url'];

function findUsername(scope: ParentNode, before: HTMLInputElement | null) {
  const candidates = [...scope.querySelectorAll<HTMLInputElement>('input')].filter(
    (input) => textTypes.includes(input.type.toLowerCase()) && usable(input),
  );
  const tagged = candidates.find((input) =>
    /username|email/i.test(`${input.autocomplete} ${input.type}`),
  );
  if (tagged) return tagged;
  if (!before) return candidates[0] ?? null;
  // The text field right before the password one.
  const earlier = candidates.filter(
    (input) => input.compareDocumentPosition(before) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
  return earlier.at(-1) ?? null;
}

function fill(username: string | null, password: string | null): FillResult {
  const passwords = [
    ...document.querySelectorAll<HTMLInputElement>('input[type="password"]'),
  ].filter(usable);
  const passwordInput = passwords[0] ?? null;
  const scope: ParentNode = passwordInput?.form ?? document;
  const usernameInput = username !== null ? findUsername(scope, passwordInput) : null;
  if (usernameInput && username !== null) setValue(usernameInput, username);
  if (passwordInput && password !== null) setValue(passwordInput, password);
  return {
    username: !!usernameInput && username !== null,
    password: !!passwordInput && password !== null,
    insecure: location.protocol === 'http:' && !!passwordInput,
  };
}

declare global {
  var __chambappFill: typeof fill | undefined;
}

globalThis.__chambappFill = fill;

export {};
