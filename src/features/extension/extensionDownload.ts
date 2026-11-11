import { EXTENSION_RELEASE_DOWNLOAD } from '../../lib/project';

/** Packages built by `npm run ext:pack` into public/downloads. */
export const EXTENSION_ZIP = '/downloads/chambapp-extension.zip';
export const EXTENSION_XPI = '/downloads/chambapp-extension-firefox.xpi';
const PACKAGE_INFO = '/downloads/extension.json';
export const EXTENSION_FOLDER = 'chambapp-extension';

export type BrowserKind = 'chrome' | 'edge' | 'firefox';

export type PackageInfo = { version: string; firefoxSigned: boolean; cloud: boolean };

export type DownloadState =
  | { status: 'idle' }
  | { status: 'starting' }
  | { status: 'started' }
  | { status: 'error'; message: string };

/** Detected browser; Chromium-based ones that are not Edge install like Chrome. */
export function browserKind(userAgent: string): BrowserKind {
  if (/\bEdg\//.test(userAgent)) return 'edge';
  if (/\bFirefox\//.test(userAgent) && !/\bSeamonkey\//i.test(userAgent)) return 'firefox';
  return 'chrome';
}

export function extensionsPage(kind: BrowserKind) {
  if (kind === 'edge') return 'edge://extensions';
  if (kind === 'firefox') return 'about:addons';
  return 'chrome://extensions';
}

export const FIREFOX_DEBUGGING = 'about:debugging#/runtime/this-firefox';

/** Version and whether the Firefox file is signed by Mozilla; null when not packaged. */
export async function loadPackageInfo(): Promise<PackageInfo | null> {
  try {
    const response = await fetch(PACKAGE_INFO, { cache: 'no-store' });
    if (!response.ok || !(response.headers.get('content-type') ?? '').includes('json')) return null;
    const value = (await response.json()) as Partial<PackageInfo>;
    return typeof value.version === 'string'
      ? {
          version: value.version,
          firefoxSigned: value.firefoxSigned === true,
          cloud: value.cloud !== false,
        }
      : null;
  } catch {
    return null;
  }
}

/** Same files, published from main in the repository's GitHub release. */
export function releaseUrl(kind: BrowserKind) {
  return `${EXTENSION_RELEASE_DOWNLOAD}/${fileName(kind)}`;
}

export function fileName(kind: BrowserKind) {
  return (kind === 'firefox' ? EXTENSION_XPI : EXTENSION_ZIP).split('/').at(-1)!;
}

/** Whether this server really has the package (a dev server answers with the app's HTML). */
async function packaged(url: string) {
  try {
    const response = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    const type = response.headers.get('content-type') ?? '';
    return response.ok && !type.includes('text/html');
  } catch {
    return false;
  }
}

function save(url: string, name?: string) {
  const link = document.createElement('a');
  link.href = url;
  if (name) link.download = name;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
}

/**
 * Starts the download from this server; when it has no package (a build without
 * `npm run ext:pack`), from the repository's GitHub release instead.
 * A signed .xpi is opened directly, so Firefox shows its "Add" prompt.
 */
export async function downloadExtension(
  kind: BrowserKind,
  info: PackageInfo | null,
): Promise<DownloadState> {
  const url = kind === 'firefox' ? EXTENSION_XPI : EXTENSION_ZIP;
  if (!(await packaged(url))) {
    save(releaseUrl(kind));
    return { status: 'started' };
  }
  if (kind === 'firefox' && info?.firefoxSigned) {
    window.location.assign(url);
    return { status: 'started' };
  }
  save(url, fileName(kind));
  return { status: 'started' };
}

const STEP_KEY = 'chambapp:extension-tutorial-step';

/** Tutorial step kept across a page reload (needed after installing the extension). */
export function rememberTutorialStep(step: number | null) {
  try {
    if (step === null) sessionStorage.removeItem(STEP_KEY);
    else sessionStorage.setItem(STEP_KEY, String(step));
  } catch {
    // Storage unavailable: the tutorial simply starts again.
  }
}

export function readTutorialStep(): number | null {
  try {
    const value = sessionStorage.getItem(STEP_KEY);
    const step = value === null ? NaN : Number(value);
    return Number.isInteger(step) && step >= 0 ? step : null;
  } catch {
    return null;
  }
}
