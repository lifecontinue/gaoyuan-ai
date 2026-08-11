/**
 * TimelineBus — 播放头 / 进度的高频发布订阅（DEVELOPMENT_PLAN §1.4 的第二条总线）
 *
 * 🚨 存在的唯一理由：**播放头位置绝对不能走 React state**。
 * 播放头每帧（rAF ≈ 60Hz）都要动，若每帧 `setState`，整棵练习页会重渲染，
 * 直接把帧率打到个位数（与 AudioBus 同一条铁律，只是数据不同）。
 *
 * 消费方式：
 *   - 播放头 / 进度条：`subscribe()` 后在回调里**直接改 DOM**（`style.transform` / `style.width`）
 *   - 小节切换、拍点等**离散**事件：由 usePracticeSession 写 zustand，不走这里
 */

import type { PositionResult } from "@/lib/audio/ScoreFollower"

/** 一次时间轴推进的完整快照 */
export interface TimelineFrame {
  /** 已播放毫秒数（Clock 权威时间，非 performance.now） */
  elapsedMs: number
  /** 全曲总时长（ms，按当前 bpm / speed 折算） */
  totalMs: number
  /** 是否正在推进 */
  running: boolean
  /** 当前曲谱位置 */
  position: PositionResult
}

export type TimelineListener = (frame: TimelineFrame) => void

export class TimelineBus {
  private listeners = new Set<TimelineListener>()
  private snapshot: TimelineFrame | null = null

  /** 发布一帧；单个订阅者抛异常不影响其它订阅者（§1.5 控制台零未捕获异常） */
  emit(frame: TimelineFrame): void {
    this.snapshot = frame
    for (const listener of this.listeners) {
      try {
        listener(frame)
      } catch (error) {
        console.error("[TimelineBus] 订阅者抛出异常，已隔离:", error)
      }
    }
  }

  /** 订阅；返回取消订阅函数（可安全重复调用） */
  subscribe(listener: TimelineListener): () => void {
    this.listeners.add(listener)
    // 立即把最近一帧补给新订阅者，避免小节切换重挂 ref 后播放头闪回原点
    if (this.snapshot) {
      try {
        listener(this.snapshot)
      } catch (error) {
        console.error("[TimelineBus] 订阅者首帧回放异常，已隔离:", error)
      }
    }
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** 最近一帧（可能为 null） */
  getSnapshot(): TimelineFrame | null {
    return this.snapshot
  }

  /** 当前订阅者数量（诊断用；泄漏时这个数会一直涨） */
  get listenerCount(): number {
    return this.listeners.size
  }

  /** 清空快照（停止播放时调用） */
  clear(): void {
    this.snapshot = null
  }

  /** 彻底重置（测试用例之间隔离） */
  reset(): void {
    this.listeners.clear()
    this.snapshot = null
  }
}

/** 全局单例 —— 整个应用只有一条时间轴总线 */
export const timelineBus = new TimelineBus()
