/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PROD?: boolean
  readonly PROD?: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}