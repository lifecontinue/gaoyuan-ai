/**
 * audioMode 单测（T1.9）
 *
 * `?audio=synth` / `?audio=osc:440` 是**沙箱唯一的验收通道**——没有麦克风时，
 * 它必须与真实拾音走完全相同的下游链路。因此解析逻辑与合成源构建都要钉死：
 *   1. 解析是纯函数，非法输入必须安全回落，绝不 throw（URL 是用户可乱填的输入）
 *   2. `?audio=osc:440` 构建出的波形喂进 PitchDetector 必须稳定读出 A4
 *   3. `?audio=synth` 构建出的和弦缓冲必须非空、有效、不削顶
 */

import { describe, expect, it } from "vitest"

import {
  buildDemoChordBuffer,
  buildSyntheticSpec,
  DEFAULT_OSC_FREQ_HZ,
  describeAudioMode,
  parseAudioModeParam,
} from "@/lib/audio/audioMode"
import { FRAME_SIZE } from "@/lib/audio/constants"
import { computePeak, computeRms } from "@/lib/audio/dsp/rms"
import { PitchDetector } from "@/lib/audio/PitchDetector"
import { generateSine } from "@/lib/audio/testing/syntheticAudio"

const SAMPLE_RATE = 48_000

describe("parseAudioModeParam", () => {
  it("未指定 audio 参数时返回 null（走真实麦克风）", () => {
    expect(parseAudioModeParam("")).toBeNull()
    expect(parseAudioModeParam("?")).toBeNull()
    expect(parseAudioModeParam("?foo=bar")).toBeNull()
  })

  it("识别 ?audio=synth", () => {
    expect(parseAudioModeParam("?audio=synth")).toEqual({ kind: "synth" })
    // 不带问号、大小写混写、前后空格都应容错
    expect(parseAudioModeParam("audio=SYNTH")).toEqual({ kind: "synth" })
  })

  it("识别 ?audio=osc:440", () => {
    expect(parseAudioModeParam("?audio=osc:440")).toEqual({
      kind: "oscillator",
      freqHz: 440,
    })
    expect(parseAudioModeParam("?audio=osc:82.41")).toEqual({
      kind: "oscillator",
      freqHz: 82.41,
    })
  })

  it("osc 不带频率时回落到默认 440Hz", () => {
    expect(parseAudioModeParam("?audio=osc")).toEqual({
      kind: "oscillator",
      freqHz: DEFAULT_OSC_FREQ_HZ,
    })
  })

  it("非法 / 越界频率回落到默认值，不抛异常", () => {
    for (const search of ["?audio=osc:abc", "?audio=osc:", "?audio=osc:0", "?audio=osc:99999", "?audio=osc:-100"]) {
      const mode = parseAudioModeParam(search)
      expect(mode).toEqual({ kind: "oscillator", freqHz: DEFAULT_OSC_FREQ_HZ })
    }
  })

  it("无法识别的值返回 null 而不是抛异常", () => {
    expect(parseAudioModeParam("?audio=bogus")).toBeNull()
    expect(parseAudioModeParam("?audio=")).toBeNull()
  })

  it("与其它 query 参数共存时仍能正确解析", () => {
    expect(parseAudioModeParam("?debug=1&audio=synth&x=2")).toEqual({ kind: "synth" })
  })
})

describe("describeAudioMode", () => {
  it("生成 DEMO AUDIO 标签文案", () => {
    expect(describeAudioMode({ kind: "synth" })).toBe("SYNTH CHORDS")
    expect(describeAudioMode({ kind: "oscillator", freqHz: 440 })).toBe("OSC 440 Hz")
  })
})

describe("buildDemoChordBuffer", () => {
  it("产出非空、有限、未削顶的波形", () => {
    const buffer = buildDemoChordBuffer(SAMPLE_RATE, 2)
    expect(buffer.length).toBeGreaterThan(SAMPLE_RATE) // 至少 1 秒
    expect(computeRms(buffer)).toBeGreaterThan(0.01)
    const peak = computePeak(buffer)
    expect(peak).toBeGreaterThan(0.1)
    expect(peak).toBeLessThanOrEqual(0.95 + 1e-6)
    for (let i = 0; i < buffer.length; i += 997) {
      expect(Number.isFinite(buffer[i])).toBe(true)
    }
  })

  it("小节数影响时长，且至少渲染 1 个小节", () => {
    const short = buildDemoChordBuffer(SAMPLE_RATE, 1)
    const long = buildDemoChordBuffer(SAMPLE_RATE, 3)
    expect(long.length).toBeGreaterThan(short.length)
    expect(buildDemoChordBuffer(SAMPLE_RATE, 0).length).toBeGreaterThan(0)
  })
})

describe("buildSyntheticSpec", () => {
  it("oscillator 模式产出振荡器 spec", () => {
    const spec = buildSyntheticSpec({ kind: "oscillator", freqHz: 440 }, SAMPLE_RATE)
    expect(spec.kind).toBe("oscillator")
    if (spec.kind === "oscillator") {
      expect(spec.freqHz).toBe(440)
      expect(spec.gain).toBeGreaterThan(0)
    }
  })

  it("synth 模式产出循环播放的 buffer spec", () => {
    const spec = buildSyntheticSpec({ kind: "synth" }, SAMPLE_RATE)
    expect(spec.kind).toBe("buffer")
    if (spec.kind === "buffer") {
      expect(spec.loop).toBe(true)
      expect(spec.samples.length).toBeGreaterThan(0)
    }
  })
})

describe("?audio=osc:440 的端到端等价性", () => {
  it("振荡器 spec 对应的波形喂进 PitchDetector 稳定读出 A4 / |cents| < 5", () => {
    const mode = parseAudioModeParam("?audio=osc:440")
    expect(mode).not.toBeNull()
    const spec = buildSyntheticSpec(mode!, SAMPLE_RATE)
    expect(spec.kind).toBe("oscillator")

    // 浏览器里由 OscillatorNode 产生，node 里用等价的正弦复现同一激励
    const freqHz = spec.kind === "oscillator" ? spec.freqHz : DEFAULT_OSC_FREQ_HZ
    const gain = spec.kind === "oscillator" ? spec.gain : 0.5
    const samples = generateSine(freqHz, SAMPLE_RATE, FRAME_SIZE, gain)

    const detector = new PitchDetector()
    const result = detector.detectFromBuffer(samples, SAMPLE_RATE, 0)
    expect(result).not.toBeNull()
    expect(result!.noteName).toBe("A")
    expect(result!.octave).toBe(4)
    expect(Math.abs(result!.centsOff)).toBeLessThan(5)
  })
})
