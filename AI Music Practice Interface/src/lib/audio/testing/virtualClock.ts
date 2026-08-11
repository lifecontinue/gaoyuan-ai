/**
 * VirtualClock（DEVELOPMENT_PLAN §1.8 L1）
 *
 * 可手动推进的时钟，实现 `Clock` 接口。
 * 用它替换 `AudioContext.currentTime` / `performance.now()`，
 * 让所有依赖时间的逻辑（NoteStabilizer 的八度纠错窗、ScoreFollower 的位移）
 * 在 node 里完全确定性可测。
 *
 * 约束：不引用 window / performance / AudioContext。
 */

import type { Clock } from "@/lib/audio/types"
import { HOP_SIZE, SAMPLE_RATE_FALLBACK } from "@/lib/audio/constants"

/** 可手动推进的确定性时钟 */
export class VirtualClock implements Clock {
  private currentMs: number

  /**
   * @param startMs 起始时间（毫秒，默认 0）
   */
  constructor(startMs: number = 0) {
    this.currentMs = startMs
  }

  /** 当前时间（秒） */
  nowSec(): number {
    return this.currentMs / 1000
  }

  /** 当前时间（毫秒） */
  nowMs(): number {
    return this.currentMs
  }

  /** 前进指定毫秒数（负值会被忽略并抛出，属于程序员错误） */
  advance(deltaMs: number): void {
    if (deltaMs < 0) {
      throw new Error(`VirtualClock.advance 不接受负值: ${deltaMs}`)
    }
    this.currentMs += deltaMs
  }

  /** 按样本数前进（等价于 advance(samples / sampleRate * 1000)） */
  advanceSamples(samples: number, sampleRate: number = SAMPLE_RATE_FALLBACK): void {
    this.advance((samples / sampleRate) * 1000)
  }

  /** 前进一个 HOP（默认 1024 样本 @ 48kHz ≈ 21.33ms） */
  advanceHop(hopSize: number = HOP_SIZE, sampleRate: number = SAMPLE_RATE_FALLBACK): void {
    this.advanceSamples(hopSize, sampleRate)
  }

  /** 直接跳到指定时间（毫秒），不允许回退 */
  setMs(valueMs: number): void {
    if (valueMs < this.currentMs) {
      throw new Error(`VirtualClock 不允许时间回退: ${this.currentMs} → ${valueMs}`)
    }
    this.currentMs = valueMs
  }

  /** 重置到指定时间（测试用例之间复用实例时调用） */
  reset(startMs: number = 0): void {
    this.currentMs = startMs
  }
}

/**
 * 生产环境时钟：基于 `AudioContext.currentTime`。
 * 放在 testing/ 目录只是因为它与 VirtualClock 是同一组抽象的两种实现，
 * 使用方（ScoreFollower / AnalysisPipeline）通过 `Clock` 接口消费，互不感知。
 */
export function createAudioContextClock(getCurrentTimeSec: () => number): Clock {
  return {
    nowSec: () => getCurrentTimeSec(),
    nowMs: () => getCurrentTimeSec() * 1000,
  }
}
