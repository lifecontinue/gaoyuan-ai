/**
 * Vite 环境变量类型声明
 */

/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API 基础路径（默认空，走相对路径 /api） */
  readonly VITE_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
