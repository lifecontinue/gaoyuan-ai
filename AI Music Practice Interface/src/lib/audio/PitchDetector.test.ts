/**
 * PitchDetector 单测（T1.4）
 *
 * 机器验证的 DoD 项：
 *   - **DoD #4**：generateSine(440, 48000, 4096) → noteName "A" / octave 4 / |centsOff| < 5 / clarity > 0.95
 *   - **DoD #6**（检测器层）：-70dBFS 噪声不过噪声门限，逐帧全部返回 null
 *   - **DoD #7**（检测器层）：静音逐帧全部返回 null 且 rms < NOISE_GATE_RMS
 *
 * 所有用例都走 `detectFromBuffer` 纯计算入口，不触碰 AudioContext（node 可跑）。
 * 时间戳一律由 VirtualClock 注入，杜绝对 performance.now 的隐式依赖。
 */

import { describe, expect, it } from "vitest"

import {
  FRAME_SIZE,
  HOP_SIZE,
  NOISE_GATE_RMS,
  PITCH_MAX_HZ,
  PITCH_MIN_HZ,
} from "@/lib/audio/constants"
import { computeRms } from "@/lib/audio/dsp/rms"
import { PitchDetector } from "@/lib/audio/PitchDetector"
import {
  generateNoise,
  generatePluckedTone,
  generateSilence,
  generateSine,
  sliceFrames,
} from "@/lib/audio/testing/syntheticAudio"
import { VirtualClock } from "@/lib/audio/testing/virtualClock"

const SAMPLE_RATE = 48_000

describe("PitchDetector.detectFromBuffer", () => {
  it("DoD #4：440Hz 正弦 → A4，|centsOff| < 5，clarity > 0.95", () => {
    const detector = new PitchDetector()
    const clock = new VirtualClock()
    const samples = generateSine(440, SAMPLE_RATE, FRAME_SIZE)

    const result = detector.detectFromBuffer(samples, SAMPLE_RATE, clock.nowMs())

    expect(result).not.toBeNull()
    expect(result!.noteName).toBe("A")
    expect(result!.octave).toBe(4)
    expect(Math.abs(result!.centsOff)).toBeLessThan(5)
    expect(result!.clarity).toBeGreaterThan(0.95)
    expect(result!.midi).toBe(69)
    expect(result!.frequency).toBeCloseTo(440, 0)
    expect(result!.timestamp).toBe(0)
  })

  it("时间戳来自调用方注入的虚拟时钟，而非 performance.now", () => {
    const detector = new PitchDetector()
    const clock = new VirtualClock()
    const samples = generateSine(440, SAMPLE_RATE, FRAME_SIZE)

    clock.advance(1234)
    const result = detector.detectFromBuffer(samples, SAMPLE_RATE, clock.nowMs())
    expect(result!.timestamp).toBe(1234)
  })

  it("覆盖吉他六根空弦，音名/八度全部正确", () => {
    const detector = new PitchDetector()
    const openStrings: ReadonlyArray<[number, string, number]> = [
      [82.41, "E", 2],
      [110.0, "A", 2],
      [146.83, "D", 3],
      [196.0, "G", 3],
      [246.94, "B", 3],
      [329.63, "E", 4],
    ]

    for (const [freq, name, octave] of openStrings) {
      const samples = generateSine(freq, SAMPLE_RATE, FRAME_SIZE)
      const result = detector.detectFromBuffer(samples, SAMPLE_RATE, 0)
      expect(result, `${name}${octave} @ ${freq}Hz 应被检出`).not.toBeNull()
      expect(result!.noteName).toBe(name)
      expect(result!.octave).toBe(octave)
      expect(Math.abs(result!.centsOff)).toBeLessThan(15)
    }
  })

  it("DoD #7：静音逐帧全部返回 null，且 rms 低于噪声门限", () => {
    const detector = new PitchDetector()
    const clock = new VirtualClock()
    const silence = generateSilence(SAMPLE_RATE, SAMPLE_RATE) // 1 秒
    const frames = sliceFrames(silence, FRAME_SIZE, HOP_SIZE)

    expect(frames.length).toBeGreaterThan(40)
    for (const frame of frames) {
      expect(computeRms(frame)).toBeLessThan(NOISE_GATE_RMS)
      expect(detector.detectFromBuffer(frame, SAMPLE_RATE, clock.nowMs())).toBeNull()
      clock.advanceHop()
    }
  })

  it("DoD #6：-70dBFS 噪声逐帧全部返回 null（噪声门限先于 MPM 生效）", () => {
    const detector = new PitchDetector()
    const clock = new VirtualClock()
    const noise = generateNoise(SAMPLE_RATE, SAMPLE_RATE, -70)
    const frames = sliceFrames(noise, FRAME_SIZE, HOP_SIZE)

    expect(frames.length).toBeGreaterThan(40)
    for (const frame of frames) {
      expect(detector.detectFromBuffer(frame, SAMPLE_RATE, clock.nowMs())).toBeNull()
      clock.advanceHop()
    }
  })

  it("超出 [PITCH_MIN_HZ, PITCH_MAX_HZ] 的音被过滤", () => {
    const detector = new PitchDetector()
    const tooLow = generateSine(PITCH_MIN_HZ - 20, SAMPLE_RATE, FRAME_SIZE)
    const tooHigh = generateSine(PITCH_MAX_HZ + 400, SAMPLE_RATE, FRAME_SIZE)

    expect(detector.detectFromBuffer(tooLow, SAMPLE_RATE, 0)).toBeNull()
    expect(detector.detectFromBuffer(tooHigh, SAMPLE_RATE, 0)).toBeNull()
  })

  it("非法输入（空缓冲 / 非法采样率）安全返回 null，不抛异常", () => {
    const detector = new PitchDetector()
    expect(detector.detectFromBuffer(generateSilence(SAMPLE_RATE, 0), SAMPLE_RATE, 0)).toBeNull()
    expect(detector.detectFromBuffer(generateSine(440, SAMPLE_RATE, 4096), 0, 0)).toBeNull()
  })

  it("未绑定 AudioEngine 时 detect() 返回 null 而不是抛异常", () => {
    const detector = new PitchDetector()
    expect(detector.detect(0)).toBeNull()
  })

  it("可自定义噪声门限：放宽后 -70dBFS 的 440Hz 正弦能被检出", () => {
    const strict = new PitchDetector()
    const loose = new PitchDetector(null, { noiseGateDbfs: -90 })
    // -70dBFS rms 的正弦 → 峰值幅度 = rms * sqrt(2)
    const amplitude = Math.pow(10, -70 / 20) * Math.SQRT2
    const quiet = generateSine(440, SAMPLE_RATE, FRAME_SIZE, amplitude)

    expect(strict.detectFromBuffer(quiet, SAMPLE_RATE, 0)).toBeNull()
    const result = loose.detectFromBuffer(quiet, SAMPLE_RATE, 0)
    expect(result).not.toBeNull()
    expect(result!.noteName).toBe("A")
  })

  it("拨弦音（含 5 次谐波 + 指数衰减）仍能检出基频，不被谐波带偏", () => {
    const detector = new PitchDetector()
    // A2 = 110Hz，取起振后的一帧
    const tone = generatePluckedTone(110, SAMPLE_RATE, FRAME_SIZE * 2)
    const frame = tone.subarray(FRAME_SIZE, FRAME_SIZE * 2) as Float32Array<ArrayBuffer>

    const result = detector.detectFromBuffer(frame, SAMPLE_RATE, 0)
    expect(result).not.toBeNull()
    expect(result!.midi).toBe(45) // A2
  })

  it("dispose 后仍可继续使用（缓存重建，不残留脏状态）", () => {
    const detector = new PitchDetector()
    const samples = generateSine(440, SAMPLE_RATE, FRAME_SIZE)
    expect(detector.detectFromBuffer(samples, SAMPLE_RATE, 0)!.midi).toBe(69)
    detector.dispose()
    expect(detector.detectFromBuffer(samples, SAMPLE_RATE, 0)!.midi).toBe(69)
  })
})
