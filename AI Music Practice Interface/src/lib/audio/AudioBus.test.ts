/**
 * AudioBus 单测（T1.6）
 *
 * 重点是 §1.5 那条硬要求："控制台零未捕获异常" —— 单个订阅者抛错不能带崩整条帧总线。
 * 另外验证 getSnapshot 的引用稳定性（useSyncExternalStore 依赖它做相等性判断）。
 */

import { afterEach, describe, expect, it, vi } from "vitest"

import { AudioBus, audioBus } from "@/lib/audio/AudioBus"
import type { AudioFrame } from "@/lib/audio/types"

function makeFrame(timeSec: number): AudioFrame {
  return {
    timeSec,
    musicTimeMs: timeSec * 1000,
    rms: 0.1,
    levelDb: -20,
    aboveGate: true,
    pitch: null,
    confirmedNote: null,
    chroma: new Float32Array(12),
    onset: false,
    onsetTimeMs: timeSec * 1000,
    spectralFlux: 0,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("AudioBus", () => {
  it("初始快照为 null，emit 后可读到最新帧", () => {
    const bus = new AudioBus()
    expect(bus.getSnapshot()).toBeNull()

    const frame = makeFrame(1)
    bus.emitFrame(frame)
    expect(bus.getSnapshot()).toBe(frame)
    expect(bus.emittedCount).toBe(1)
  })

  it("两次 emit 之间快照引用保持稳定（useSyncExternalStore 前提）", () => {
    const bus = new AudioBus()
    const frame = makeFrame(1)
    bus.emitFrame(frame)
    expect(bus.getSnapshot()).toBe(bus.getSnapshot())
  })

  it("订阅者按序收到每一帧，取消订阅后不再收到", () => {
    const bus = new AudioBus()
    const received: number[] = []
    const unsubscribe = bus.subscribe((f) => received.push(f.timeSec))

    expect(bus.listenerCount).toBe(1)
    bus.emitFrame(makeFrame(1))
    bus.emitFrame(makeFrame(2))
    unsubscribe()
    bus.emitFrame(makeFrame(3))

    expect(received).toEqual([1, 2])
    expect(bus.listenerCount).toBe(0)
  })

  it("重复调用取消订阅函数是安全的", () => {
    const bus = new AudioBus()
    const unsubscribe = bus.subscribe(() => {})
    unsubscribe()
    expect(() => unsubscribe()).not.toThrow()
    expect(bus.listenerCount).toBe(0)
  })

  it("单个订阅者抛异常被隔离，其它订阅者仍收到帧", () => {
    const bus = new AudioBus()
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const healthy: number[] = []

    bus.subscribe(() => {
      throw new Error("订阅者内部炸了")
    })
    bus.subscribe((f) => healthy.push(f.timeSec))

    expect(() => bus.emitFrame(makeFrame(7))).not.toThrow()
    expect(healthy).toEqual([7])
    expect(errorSpy).toHaveBeenCalledOnce()
  })

  it("clear 只清快照，不动订阅者；reset 全清", () => {
    const bus = new AudioBus()
    bus.subscribe(() => {})
    bus.emitFrame(makeFrame(1))

    bus.clear()
    expect(bus.getSnapshot()).toBeNull()
    expect(bus.listenerCount).toBe(1)
    expect(bus.emittedCount).toBe(1)

    bus.reset()
    expect(bus.listenerCount).toBe(0)
    expect(bus.emittedCount).toBe(0)
    expect(bus.getSnapshot()).toBeNull()
  })

  it("导出的 audioBus 是可用的单例实例", () => {
    expect(audioBus).toBeInstanceOf(AudioBus)
  })
})
