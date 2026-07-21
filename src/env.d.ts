/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** Auth API base (tds-auth-api via the gateway's /auth prefix). */
  readonly PUBLIC_AUTH_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
