/** How a credential's address relates to the page being filled. */
export type SiteMatch = 'exact' | 'subdomain';

type Site = { host: string; port: string; literal: boolean };

function site(value: string): Site | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!hostname) return null;
  const literal =
    hostname === 'localhost' ||
    hostname.startsWith('[') ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
  return {
    host: literal ? hostname : hostname.replace(/^www\./, ''),
    port: url.port,
    literal,
  };
}

/** Host shown to the user when confirming a fill on another site. */
export function displayHost(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.host.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Only an exact host (ignoring one leading `www.`) counts as "this site".
 * A subdomain of the stored host is suggested but needs confirmation. No
 * "registrable domain" guess: tenants of shared hosts (vercel.app, github.io…)
 * never match each other.
 */
export function matchSite(credentialUrl: string, tabUrl: string): SiteMatch | null {
  const stored = site(credentialUrl);
  const page = site(tabUrl);
  if (!stored || !page) return null;
  if (stored.literal || page.literal)
    return stored.host === page.host && stored.port === page.port ? 'exact' : null;
  if (stored.host === page.host) return !stored.port || stored.port === page.port ? 'exact' : null;
  return page.host.endsWith(`.${stored.host}`) ? 'subdomain' : null;
}

export function matchCredentials<T extends { url: string }>(items: readonly T[], tabUrl: string) {
  const exact: T[] = [];
  const related: T[] = [];
  for (const item of items) {
    const match = item.url ? matchSite(item.url, tabUrl) : null;
    if (match === 'exact') exact.push(item);
    else if (match === 'subdomain') related.push(item);
  }
  return { exact, related };
}
