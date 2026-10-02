import { oauthProviders } from './oauth';
import type { OAuthProviderDefinition } from './oauth';

/** Local, decorative marks: the adjacent provider name supplies the accessible label. */
export function OAuthProviderIcon({ provider }: { provider: OAuthProviderDefinition['id'] }) {
  const common = {
    className: 'auth-provider-icon',
    viewBox: '0 0 24 24',
    'aria-hidden': true as const,
    focusable: false,
  };
  switch (provider) {
    case 'google':
      return (
        <svg {...common}>
          <path
            fill="#4285f4"
            d="M21.6 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.74 2.98-4.3 2.98-7.37Z"
          />
          <path
            fill="#34a853"
            d="M12 22c2.7 0 4.96-.89 6.62-2.4l-3.24-2.51c-.9.6-2.04.97-3.38.97-2.6 0-4.8-1.76-5.58-4.12H3.08v2.59A10 10 0 0 0 12 22Z"
          />
          <path
            fill="#fbbc05"
            d="M6.42 13.94a6 6 0 0 1 0-3.88V7.47H3.08a10 10 0 0 0 0 9.06l3.34-2.59Z"
          />
          <path
            fill="#ea4335"
            d="M12 5.94c1.48 0 2.8.5 3.84 1.51l2.88-2.88A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.92 5.47l3.34 2.59C7.2 7.7 9.4 5.94 12 5.94Z"
          />
        </svg>
      );
    case 'azure':
      return (
        <svg {...common}>
          <path fill="#f25022" d="M2 2h9v9H2z" />
          <path fill="#7fba00" d="M13 2h9v9h-9z" />
          <path fill="#00a4ef" d="M2 13h9v9H2z" />
          <path fill="#ffb900" d="M13 13h9v9h-9z" />
        </svg>
      );
    case 'apple':
      return (
        <svg {...common} fill="currentColor">
          <path d="M17.15 12.6c.03 3.01 2.64 4.01 2.67 4.02-.03.08-.42 1.43-1.38 2.82-.84 1.2-1.71 2.4-3.08 2.43-1.33.02-1.76-.79-3.28-.79-1.51 0-1.99.77-3.24.81-1.32.05-2.32-1.3-3.17-2.5C3.94 16.9 2.62 12.36 4.4 9.27a4.9 4.9 0 0 1 4.14-2.51c1.29-.03 2.51.87 3.29.87s2.25-1.08 3.8-.92a4.7 4.7 0 0 1 3.64 1.97c-.1.06-2.15 1.25-2.12 3.92ZM14.65 5.1c.71-.86 1.19-2.06 1.06-3.26-1.03.04-2.28.69-3.02 1.55-.66.76-1.24 1.97-1.08 3.14 1.15.09 2.32-.58 3.04-1.43Z" />
        </svg>
      );
    case 'github':
      return (
        <svg {...common} fill="currentColor">
          <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.86c-2.78.61-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1.01.07 1.54 1.04 1.54 1.04.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.03a9.6 9.6 0 0 1 5 0c1.91-1.3 2.74-1.03 2.74-1.03.56 1.38.21 2.4.11 2.65.64.7 1.03 1.6 1.03 2.69 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.86v2.76c0 .26.18.58.69.48A10 10 0 0 0 12 2Z" />
        </svg>
      );
    case 'facebook':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="11" fill="#1877f2" />
          <path
            fill="white"
            d="M13.6 23v-8.7h2.9l.44-3.4H13.6V8.73c0-.99.28-1.66 1.67-1.66h1.78V4.03a23 23 0 0 0-2.6-.14c-2.58 0-4.35 1.58-4.35 4.48v2.53H7.2v3.4h2.9V23Z"
          />
        </svg>
      );
    case 'x':
    case 'twitter':
      return (
        <svg {...common} fill="currentColor">
          <path d="M18.9 2H22l-6.8 7.78L23.2 22h-6.26l-4.9-7.42L5.54 22H2.4l7.97-9.12L2.7 2h6.41l4.44 6.77L18.9 2ZM17.75 19.85h1.73L8.15 4.03H6.3l11.45 15.82Z" />
        </svg>
      );
    case 'linkedin_oidc':
      return (
        <svg {...common}>
          <rect x="1" y="1" width="22" height="22" rx="3" fill="#0a66c2" />
          <path
            fill="white"
            d="M5 9h3v10H5zM6.5 4.5a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5ZM10 9h3v1.36c.5-.89 1.4-1.61 2.95-1.61 3.14 0 3.72 2.06 3.72 4.75V19h-3v-4.89c0-1.17-.02-2.67-1.63-2.67-1.62 0-1.87 1.27-1.87 2.59V19H10Z"
          />
        </svg>
      );
    case 'discord':
      return (
        <svg {...common} fill="#8992ff">
          <path d="M19.73 5.24a18.9 18.9 0 0 0-4.7-1.46l-.6 1.23a17.7 17.7 0 0 0-4.87 0l-.61-1.23a19 19 0 0 0-4.7 1.46C1.28 9.64.48 13.92.88 18.14a19.6 19.6 0 0 0 5.76 2.92l1.2-1.96a12.5 12.5 0 0 1-1.83-.88l.45-.35a13.9 13.9 0 0 0 11.09 0l.45.35c-.6.34-1.22.64-1.83.88l1.2 1.96a19.6 19.6 0 0 0 5.75-2.92c.49-4.9-.84-9.14-3.39-12.9ZM8.27 15.5c-1.09 0-1.98-.99-1.98-2.2s.87-2.2 1.98-2.2 2.01.99 1.99 2.2c0 1.21-.88 2.2-1.99 2.2Zm7.47 0c-1.1 0-1.99-.99-1.99-2.2s.87-2.2 1.99-2.2 2 .99 1.98 2.2c0 1.21-.87 2.2-1.98 2.2Z" />
        </svg>
      );
    default:
      return (
        <span className="auth-provider-icon auth-provider-icon--monogram" aria-hidden="true">
          {oauthProviders.find((item) => item.id === provider)?.monogram}
        </span>
      );
  }
}
