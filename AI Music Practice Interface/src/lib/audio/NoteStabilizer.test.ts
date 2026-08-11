/**
 * NoteStabilizer 单测（T1.4）
 *
 * 这一层是"屏幕不乱跳"的核心保障，重点验证三件事：
 *   1. 连续帧确认：不足 confirmFrames 不输出，达到后每帧持续输出（isNew 只在换音时为 true）
 *   2. 八度纠错：整八度跳变在时间窗内被拉回低八度（E2 倍频误判的典型形态，DoD #5 的关键机制）
 *   3. 释放：连续 releaseFrames 帧无音高后回到未确认态
 *
 * 时间全部由调用方注入，无 performance 依赖。
 */

import { describe, expect, it } from "vitest"

import {
  OCTAVE_CORRECTION_WINDOW_MS,
  STABILIZER_CONFIRM_FRAMES,
  STABILIZER_RELEASE_FRAMES,
} from "@/lib/audio/constants"
import { NoteStabilizer } from "@/lib/audio/NoteStabilizer"
import { centsOff, midiToFrequency } from "@/lib/audio/noteUtils"
import type { PitchResult } from "@/lib/audio/types"

/** 由 midi 构造一个"完美命中"的 PitchResult */
function pitchAt(midi: number, timestamp: number, detuneCents = 0): PitchResult {
  const frequency = midiToFrequency(midi) * Math.pow(2, detuneCents / 1200)
  return {
    frequency,
    clarity: 0.98,
    noteName: "A",
    octave: 4,
    midi,
    centsOff: centsOff(frequency, midi),
    timestamp,
  }
}

const FRAME_MS = 21.3

describe("NoteStabilizer 连续帧确认", () => {
  it("不足 confirmFrames 帧不输出确认音", () => {
    const stabilizer = new NoteStabilizer()
    for (let i = 0; i < STABILIZER_CONFIRM_FRAMES - 1; i += 1) {
      expect(stabilizer.push(pitchAt(69, i * FRAME_MS), i * FRAME_MS)).toBeNull()
    }
    expect(stabilizer.lastConfirmed).toBeNull()
  })

  it("达到 confirmFrames 帧后输出确认音，首次 isNew=true", () => {
    const stabilizer = new NoteStabilizer()
    let confirmed = null
    for (let i = 0; i < STABILIZER_CONFIRM_FRAMES; i += 1) {
      confirmed = stabilizer.push(pitchAt(69, i * FRAME_MS), i * FRAME_MS)
    }
    expect(confirmed).not.toBeNull()
    expect(confirmed!.midi).toBe(69)
    expect(confirmed!.noteName).toBe("A")
    expect(confirmed!.octave).toBe(4)
    expect(confirmed!.isNew).toBe(true)
    expect(confirmed!.onsetTimeMs).toBe(0)
    expect(stabilizer.lastConfirmed).not.toBeNull()
  })

  it("确认后持续输出同一个音，isNew 变为 false（供 UI 做延音显示）", () => {
    const stabilizer = new NoteStabilizer()
    for (let i = 0; i < STABILIZER_CONFIRM_FRAMES; i += 1) {
      stabilizer.push(pitchAt(69, i * FRAME_MS), i * FRAME_MS)
    }
    const t = STABILIZER_CONFIRM_FRAMES * FRAME_MS
    const again = stabilizer.push(pitchAt(69, t), t)
    expect(again).not.toBeNull()
    expect(again!.isNew).toBe(false)
    expect(again!.midi).toBe(69)
    // onsetTimeMs 应保持首次确认的起始时间
    expect(again!.onsetTimeMs).toBe(0)
  })

  it("音高在容差内轻微失谐仍算同一个音", () => {
    const stabilizer = new NoteStabilizer()
    let confirmed = null
    // ±30 cents 在默认 60 cents 容差内
    const detunes = [0, 30, -30, 20]
    for (let i = 0; i < detunes.length; i += 1) {
      confirmed = stabilizer.push(pitchAt(69, i * FRAME_MS, detunes[i]), i * FRAME_MS)
    }
    expect(confirmed).not.toBeNull()
    expect(confirmed!.midi).toBe(69)
  })

  it("换音时候选重新计数，新音确认后 isNew=true", () => {
    const stabilizer = new NoteStabilizer()
    let t = 0
    for (let i = 0; i < STABILIZER_CONFIRM_FRAMES; i += 1, t += FRAME_MS) {
      stabilizer.push(pitchAt(60, t), t)
    }
    expect(stabilizer.lastConfirmed!.midi).toBe(60)

    // 换到 C5（+12 是整八度，会触发纠错），这里改用 +7（纯五度）避开八度逻辑
    let confirmed = null
    const onsetMs = t
    for (let i = 0; i < STABILIZER_CONFIRM_FRAMES; i += 1, t += FRAME_MS) {
      confirmed = stabilizer.push(pitchAt(67, t), t)
    }
    expect(confirmed).not.toBeNull()
    expect(confirmed!.midi).toBe(67)
    expect(confirmed!.isNew).toBe(true)
    expect(confirmed!.onsetTimeMs).toBeCloseTo(onsetMs, 6)
  })
})

describe("NoteStabilizer 八度纠错", () => {
  it("时间窗内的向上整八度跳变被拉回低八度", () => {
    const stabilizer = new NoteStabilizer()
    let t = 0
    // 先确认 E2 (midi 40)
    for (let i = 0; i < STABILIZER_CONFIRM_FRAMES; i += 1, t += FRAME_MS) {
      stabilizer.push(pitchAt(40, t), t)
    }
    expect(stabilizer.lastConfirmed!.midi).toBe(40)

    // 紧接着 MPM 误判成 E3 (midi 52)，仍在 250ms 窗口内
    let confirmed = null
    for (let i = 0; i < STABILIZER_CONFIRM_FRAMES; i += 1, t += FRAME_MS) {
      confirmed = stabilizer.push(pitchAt(52, t), t)
    }
    expect(confirmed).not.toBeNull()
    expect(confirmed!.midi).toBe(40)
    expect(confirmed!.octaveCorrected).toBe(true)
  })

  it("纠错后上报的 centsOff 已折算掉整八度（UI 音准指针不被顶到量程边缘）", () => {
    const stabilizer = new NoteStabilizer()
    let t = 0
    for (let i = 0; i < STABILIZER_CONFIRM_FRAMES; i += 1, t += FRAME_MS) {
      stabilizer.push(pitchAt(40, t), t)
    }
    // 误判成高八度、且带 +20 cents 的轻微失谐
    const confirmed = stabilizer.push(pitchAt(52, t, 20), t)
    expect(confirmed).not.toBeNull()
    expect(confirmed!.midi).toBe(40)
    expect(confirmed!.octaveCorrected).toBe(true)
    // 应上报 ~+20 cents，而不是 ~1220 cents
    expect(Math.abs(confirmed!.centsOff)).toBeLessThan(50)
    expect(confirmed!.centsOff).toBeCloseTo(20, 3)
  })

  it("超出时间窗后的整八度跳变被视为真实换音，不再纠错", () => {
    const stabilizer = new NoteStabilizer()
    let t = 0
    for (let i = 0; i < STABILIZER_CONFIRM_FRAMES; i += 1, t += FRAME_MS) {
      stabilizer.push(pitchAt(40, t), t)
    }
    // 跳过整个纠错窗口
    t += OCTAVE_CORRECTION_WINDOW_MS + 50

    let confirmed = null
    for (let i = 0; i < STABILIZER_CONFIRM_FRAMES; i += 1, t += FRAME_MS) {
      confirmed = stabilizer.push(pitchAt(52, t), t)
    }
    expect(confirmed).not.toBeNull()
    expect(confirmed!.midi).toBe(52)
    expect(confirmed!.octaveCorrected).toBe(false)
  })

  it("非整八度的大跳（如纯五度）不触发纠错", () => {
    const stabilizer = new NoteStabilizer()
    let t = 0
    for (let i = 0; i < STABILIZER_CONFIRM_FRAMES; i += 1, t += FRAME_MS) {
      stabilizer.push(pitchAt(40, t), t)
    }
    let confirmed = null
    for (let i = 0; i < STABILIZER_CONFIRM_FRAMES; i += 1, t += FRAME_MS) {
      confirmed = stabilizer.push(pitchAt(47, t), t)
    }
    expect(confirmed!.midi).toBe(47)
    expect(confirmed!.octaveCorrected).toBe(false)
  })

  it("注入期望音级后，同和弦内的八度跳变沿用上一确认音（Phase 3 增强路径）", () => {
    const stabilizer = new NoteStabilizer()
    // Em 和弦音级：E(4) G(7) B(11)
    stabilizer.setExpectedPitchClasses([4, 7, 11])
    let t = 0
    for (let i = 0; i < STABILIZER_CONFIRM_FRAMES; i += 1, t += FRAME_MS) {
      stabilizer.push(pitchAt(40, t), t) // E2
    }
    let confirmed = null
    for (let i = 0; i < STABILIZER_CONFIRM_FRAMES; i += 1, t += FRAME_MS) {
      confirmed = stabilizer.push(pitchAt(52, t), t) // E3，同音级
    }
    expect(confirmed!.midi).toBe(40)
    expect(confirmed!.octaveCorrected).toBe(true)

    // 关闭增强后回到 Phase 1 的"取低八度"，结论一致但路径不同
    stabilizer.setExpectedPitchClasses(null)
    expect(stabilizer.lastConfirmed!.midi).toBe(40)
  })
})

describe("NoteStabilizer 释放", () => {
  it("连续 releaseFrames 帧无音高后释放确认态", () => {
    const stabilizer = new NoteStabilizer()
    let t = 0
    for (let i = 0; i < STABILIZER_CONFIRM_FRAMES; i += 1, t += FRAME_MS) {
      stabilizer.push(pitchAt(69, t), t)
    }
    expect(stabilizer.lastConfirmed).not.toBeNull()

    for (let i = 0; i < STABILIZER_RELEASE_FRAMES - 1; i += 1, t += FRAME_MS) {
      stabilizer.push(null, t)
      expect(stabilizer.lastConfirmed).not.toBeNull()
    }
    stabilizer.push(null, t)
    expect(stabilizer.lastConfirmed).toBeNull()
  })

  it("null 输入始终返回 null（静音帧不会输出确认音）", () => {
    const stabilizer = new NoteStabilizer()
    for (let i = 0; i < 20; i += 1) {
      expect(stabilizer.push(null, i * FRAME_MS)).toBeNull()
    }
  })

  it("reset 清空全部内部状态", () => {
    const stabilizer = new NoteStabilizer()
    let t = 0
    for (let i = 0; i < STABILIZER_CONFIRM_FRAMES; i += 1, t += FRAME_MS) {
      stabilizer.push(pitchAt(69, t), t)
    }
    expect(stabilizer.lastConfirmed).not.toBeNull()
    stabilizer.reset()
    expect(stabilizer.lastConfirmed).toBeNull()
    // reset 后需重新累计 confirmFrames 帧
    expect(stabilizer.push(pitchAt(69, t), t)).toBeNull()
  })

  it("自定义 confirmFrames=1 时首帧即确认", () => {
    const stabilizer = new NoteStabilizer({ confirmFrames: 1 })
    const confirmed = stabilizer.push(pitchAt(69, 0), 0)
    expect(confirmed).not.toBeNull()
    expect(confirmed!.isNew).toBe(true)
  })
})
