/**
 * 乐段标签 — 顶部栏 eyebrow 的纯计算
 *
 * 设计稿里这行是写死的 `PRACTICE SESSION · VERSE 2 · BARS 17—28`。
 * Phase 2 把它接到真实跟随状态上：跟随器切到哪个乐段，这里就显示哪个乐段。
 *
 * 抽成独立模块（而不是留在 TopBar.tsx 里）的原因很实际：
 * vitest 的 `environment: "node"` + `include: src/**./*.test.ts` 是一道架构护栏，
 * `.tsx` 里的逻辑天然测不到。凡是有分支的显示逻辑都得挪到 `.ts` 里才能被机器验证。
 */

import type { Score, Section } from "@/lib/music/types"

/** 乐段缺失 / 无小节时的占位符 —— 绝不让 UI 出现 `BARS undefined—undefined` */
export const EMPTY_BAR_RANGE = "—"

/**
 * 乐段的小节区间文本。
 *
 * - 多小节 → `BARS 17—28`
 * - 单小节 → `BAR 17`（不写成 `BARS 17—17`）
 * - 空乐段 / null → `—`
 */
export function sectionBarRange(section: Section | null | undefined): string {
  if (!section || section.measures.length === 0) return EMPTY_BAR_RANGE
  const first = section.measures[0].id
  const last = section.measures[section.measures.length - 1].id
  return first === last ? `BAR ${first}` : `BARS ${first}—${last}`
}

/**
 * 定位当前乐段。
 *
 * 未开播时 `sectionId` 为 null，退回首个乐段 —— UI 在静止状态下也要有正确落点，
 * 不能空着（这正是 Phase 1 遗留 `?? 19` 那类硬编码的来源）。
 */
export function resolveSection(score: Score, sectionId: string | null): Section | null {
  if (score.sections.length === 0) return null
  if (sectionId !== null) {
    const hit = score.sections.find((s) => s.id === sectionId)
    if (hit) return hit
  }
  return score.sections[0]
}

/** 顶部 eyebrow 文案：`PRACTICE SESSION · <乐段> · <小节区间>` */
export function buildEyebrow(score: Score, sectionId: string | null): string {
  const section = resolveSection(score, sectionId)
  const name = section ? section.name.toUpperCase() : "NO SECTION"
  return `PRACTICE SESSION · ${name} · ${sectionBarRange(section)}`
}
