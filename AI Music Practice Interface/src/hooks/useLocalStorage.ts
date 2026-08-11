/**
 * useLocalStorage — 通用 localStorage 持久化 hook
 *
 * libraryStore 已用 zustand persist 中间件处理歌曲库，
 * 此 hook 供其他需要 localStorage 的场景使用。
 */

import { useState, useEffect, useCallback } from "react"

export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key)
      return saved ? (JSON.parse(saved) as T) : initial
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // 忽略写入失败（如 quota 超限）
    }
  }, [key, value])

  const reset = useCallback(() => setValue(initial), [initial])

  return [value, setValue, reset] as const
}
