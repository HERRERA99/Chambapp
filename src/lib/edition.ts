// Which Chambapp this build is: the cloud one (Supabase, accounts) or the local one
// (Docker on the user's PC, no accounts). Set at build time with VITE_EDITION=local
// (`npm run build:local`); a constant, so the bundler drops the other edition's code.
export const isLocalEdition = import.meta.env.VITE_EDITION === 'local';
