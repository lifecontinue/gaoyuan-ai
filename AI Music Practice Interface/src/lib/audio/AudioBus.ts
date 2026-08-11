/**
 * AudioBus — 高频数据发布订阅（DEVELOPMENT_PLAN §1.4）
 *
 * 🚨 存在的唯一理由：**每帧（~21ms）产生的数据绝对不能写 zustand**。
 * 21ms 写一次 store 会触发全树重渲染，直接掉到 20fps 以下。
 *
 * 本类刻意做成极简的同步发布订阅（不是 zustand、不做不可变更新、不做 diff）：
 *   - 每帧消费者（HUD / 电平表 / playhead）：`getSnapshot()` + rAF 节流到 ≤20Hz
 *   - 离散事件消费者（小节切换 / onset 判定）：才允许写 sessionStore
 */

import type { AudioFrame } from "@/lib/audio/types"

export type AudioFrameListener = (frame: AudioFrame) => void

export class AudioBus {
  private listeners = new Set<AudioFrameListener>()
  private snapshot: AudioFrame | null = null
  private emitted = 0

  /**
   * 发布一帧。同步调用所有订阅者。
   * 单个订阅者抛异常不会影响其它订阅者（§1.5：控制台零未捕获异常）。
   */
  emitFrame(frame: AudioFrame): void {
    this.snapshot = frame
    this.emitted += 1
    for (const listener of this.listeners) {
      try {
        listener(frame)
      } catch (error) {
        console.error("[AudioBus] 订阅者抛出异常，已隔离:", error)
      }
    }
  }

  /**
   * 订阅。
   * @returns 取消订阅函数（可安全重复调用）
   */
  subscribe(listener: AudioFrameListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * 取最近一帧。
   * 引用在两次 `emitFrame` 之间保持稳定，可直接用于 `useSyncExternalStore`。
   */
  getSnapshot(): AudioFrame | null {
    return this.snapshot
  }

  /** 清空最近一帧（停止采集时调用，让 HUD 回到待机态） */
  clear(): void {
    this.snapshot = null
  }

  /** 已发布帧数（诊断 / 性能观测用） */
  get emittedCount(): number {
    return this.emitted
  }

  /** 当前订阅者数量（诊断用；泄漏时这个数会一直涨） */
  get listenerCount(): number {
    return this.listeners.size
  }

  /** 彻底重置（测试用例之间隔离） */
  reset(): void {
    this.listeners.clear()
    this.snapshot = null
    this.emitted = 0
  }
}

/** 全局单例 —— 整个应用只有一条音频帧总线 */
export const audioBus = new AudioBus()
