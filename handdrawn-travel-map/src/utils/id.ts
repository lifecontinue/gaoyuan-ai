/**
 * 稳定 ID 生成器
 */

let counter = 0

/** 生成唯一 ID */
export function generateId(prefix = 'trip'): string {
  counter++
  return `${prefix}-${Date.now()}-${counter}-${Math.random().toString(36).slice(2, 7)}`
}
