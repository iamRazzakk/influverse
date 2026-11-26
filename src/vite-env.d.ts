/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Server base URL including the version prefix, e.g. http://localhost:9990/api/v1 */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
