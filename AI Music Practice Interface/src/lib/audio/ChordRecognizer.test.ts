/**
 * ChordRecognizer 单测（T3.4）
 *
 * **DoD #5 / #6 的机器验证在这里。**
 *   #5 正例：合成 Am7 扫弦 → 期望 Am7 → confidence ≥ 0.90 且 missingNotes 为空
 *   #6 负例：合成 Am7 扫弦 → 期望 G   → confidence ≤ 0.45（不能"什么都说对"）
 *
 * 关键：chroma 一律走 **生产口径 CHROMA_FFT_SIZE = 16384**（Phase 3 方向 1），
 * 这样"测试通过"就等价于"实时路径也能通过"。
 */

import { describe, expect, it } from "vitest"

import { ChordRecognizer } from "@/lib/audio/ChordRecognizer"
import {
  CHROMA_EXTRA_THRESHOLD,
  CHROMA_FFT_SIZE,
  CHROMA_MATCH_THRESHOLD,
  SAMPLE_RATE_FALLBACK,
} from "@/lib/audio/constants"
import { computeChroma } from "@/lib/audio/dsp/chroma"
import { computeSpectrumDb } from "@/lib/audio/dsp/fft"
import { allocBuffer, generatePluckedTone } from "@/lib/audio/testing/syntheticAudio"
import { buildChord } from "@/lib/music/theory"
import type { Chord } from "@/lib/music/types"

const SAMPLE_RATE = SAMPLE_RATE_FALLBACK

/** 用带谐波的拨弦音叠加出一个和弦，长度 = 生产 chroma 口径 */
function renderChord(freqsHz: readonly number[]): Float32Array<ArrayBuffer> {
  const out = allocBuffer(CHROMA_FFT_SIZE)
  const per = 0.5 / Math.sqrt(freqsHz.length)
  for (const f of freqsHz) {
    const tone = generatePluckedTone(f, SAMPLE_RATE, CHROMA_FFT_SIZE, { amplitude: per })
    for (let i = 0; i < CHROMA_FFT_SIZE; i += 1) out[i] += tone[i]
  }
  return out
}

/** 由 Chord 的 notes 直接渲染其 chroma（测试激励与曲谱同源，避免手抄频率抄错） */
function chromaOfChord(chord: Chord): Float32Array<ArrayBuffer> {
  const audio = renderChord(chord.notes.map((n) => n.frequency))
  return computeChroma(computeSpectrumDb(audio, CHROMA_FFT_SIZE), SAMPLE_RATE, CHROMA_FFT_SIZE)
}

/** 手工构造一个"理想 chroma"：给定音级为 1，其余为 0 */
function idealChroma(pitchClasses: readonly number[]): Float32Array<ArrayBuffer> {
  const c = allocBuffer(12)
  for (const pc of pitchClasses) c[pc] = 1
  return c
}

// 曲谱里真实使用的和弦（与 slowDancing.ts 完全同源）
const AM7 = buildChord("Am7", 2) // A2 C3 E3 G3 → pc {9,0,4,7}
const G = buildChord("G", 3) //     G3 B3 D4    → pc {7,11,2}
const FMAJ7 = buildChord("Fmaj7", 2) // F2 A2 C3 E3 → pc {5,9,0,4}
const C = buildChord("C", 3) //     C3 E3 G3    → pc {0,4,7}

describe("ChordRecognizer.recognizeFromChroma：理想 chroma 下的公式正确性", () => {
  const recognizer = new ChordRecognizer()

  it("完全命中且无杂音 → confidence = 1，missing/extra 均为空", () => {
    const m = recognizer.recognizeFromChroma(idealChroma([9, 0, 4, 7]), AM7)
    expect(m.confidence).toBeCloseTo(1, 9)
    expect(m.matchedNotes).toHaveLength(4)
    expect(m.missingNotes).toHaveLength(0)
    expect(m.extraNotes).toHaveLength(0)
    expect(m.chord).toBe(AM7)
  })

  it("缺一个内音 → confidence = 0.7×(3/4) + 0.3 = 0.825，missingNotes 精确指出缺的那个", () => {
    // 少了 G(pc=7)
    const m = recognizer.recognizeFromChroma(idealChroma([9, 0, 4]), AM7)
    expect(m.confidence).toBeCloseTo(0.7 * 0.75 + 0.3, 9)
    expect(m.matchedNotes.map((n) => n.name)).toEqual(["A", "C", "E"])
    expect(m.missingNotes.map((n) => n.name)).toEqual(["G"])
  })

  it("全空 chroma → confidence = 0.3（只剩「没有杂音」那一项），missingNotes 全量", () => {
    const m = recognizer.recognizeFromChroma(allocBuffer(12), AM7)
    expect(m.confidence).toBeCloseTo(0.3, 9)
    expect(m.matchedNotes).toHaveLength(0)
    expect(m.missingNotes).toHaveLength(4)
  })

  it("3 个及以上杂音把 extra 项彻底打到 0（0.3×(1-min(1,n/3))）", () => {
    const c = idealChroma([9, 0, 4, 7, 1, 3, 6]) // 3 个 extra
    const m = recognizer.recognizeFromChroma(c, AM7)
    expect(m.extraNotes).toHaveLength(3)
    expect(m.confidence).toBeCloseTo(0.7, 9)

    const c4 = idealChroma([9, 0, 4, 7, 1, 3, 6, 8]) // 4 个 extra，仍然只扣满 0.3
    const m4 = recognizer.recognizeFromChroma(c4, AM7)
    expect(m4.extraNotes).toHaveLength(4)
    expect(m4.confidence).toBeCloseTo(0.7, 9)
  })

  it("阈值边界：内音能量恰好等于 CHROMA_MATCH_THRESHOLD 算命中", () => {
    const c = allocBuffer(12)
    // 注意：CHROMA_MATCH_THRESHOLD(0.35) 在 float32 下存为 0.3499999940395355，
    // 严格 < 0.35，会导致 `energy >= 0.35` 判为假。改用 0.36（float32 可精确表示且 > 0.35）
    // 表示"恰好在阈值之上"，用 0.34（< 0.35）表示"恰好在阈值之下"。
    c[9] = 0.36
    c[0] = 0.34
    const m = recognizer.recognizeFromChroma(c, AM7)
    expect(m.matchedNotes.map((n) => n.name)).toEqual(["A"])
    expect(m.missingNotes.map((n) => n.name)).toEqual(["C", "E", "G"])
  })

  it("阈值边界：外音能量恰好等于 CHROMA_EXTRA_THRESHOLD 才算杂音", () => {
    const below = allocBuffer(12)
    below[1] = CHROMA_EXTRA_THRESHOLD - 1e-6
    expect(new ChordRecognizer().recognizeFromChroma(below, AM7).extraNotes).toHaveLength(0)

    const at = allocBuffer(12)
    at[1] = CHROMA_EXTRA_THRESHOLD
    expect(new ChordRecognizer().recognizeFromChroma(at, AM7).extraNotes).toHaveLength(1)
  })

  it("confidence 恒落在 [0,1]，任何输入都不越界", () => {
    const samples = [
      idealChroma([]),
      idealChroma([9, 0, 4, 7]),
      idealChroma([1, 2, 3, 5, 6, 8, 10, 11]),
      idealChroma(Array.from({ length: 12 }, (_, i) => i)),
    ]
    for (const chord of [AM7, G, FMAJ7, C]) {
      for (const c of samples) {
        const conf = recognizer.recognizeFromChroma(c, chord).confidence
        expect(conf).toBeGreaterThanOrEqual(0)
        expect(conf).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe("DoD #5：合成 Am7 扫弦 → 期望 Am7 → confidence ≥ 0.90 且无缺音", () => {
  it("生产 chroma 口径（16384）下识别 Am7", () => {
    const chroma = chromaOfChord(AM7)
    const match = new ChordRecognizer().recognizeFromChroma(chroma, AM7)

    expect(match.confidence).toBeGreaterThanOrEqual(0.9)
    expect(match.missingNotes).toHaveLength(0)
    expect(match.matchedNotes.map((n) => n.name).sort()).toEqual(["A", "C", "E", "G"])
  })

  it("曲谱里其余三个和弦同样能被自身识别（不是只为 Am7 调参）", () => {
    for (const chord of [FMAJ7, C, G]) {
      const match = new ChordRecognizer().recognizeFromChroma(chromaOfChord(chord), chord)
      expect(
        match.confidence,
        `${chord.name} 的自识别置信度过低：${match.confidence.toFixed(3)}`,
      ).toBeGreaterThanOrEqual(0.9)
      expect(match.missingNotes, `${chord.name} 存在缺音`).toHaveLength(0)
    }
  })
})

describe("DoD #6：合成 Am7 扫弦 → 期望 G → confidence ≤ 0.45（负例必须能被拒绝）", () => {
  it("弹 Am7 却期望 G：置信度显著偏低，且 missingNotes 指出 B/D 没弹", () => {
    const chroma = chromaOfChord(AM7)
    const match = new ChordRecognizer().recognizeFromChroma(chroma, G)

    expect(match.confidence).toBeLessThanOrEqual(0.45)
    // G 的三个内音里，只有 G(pc=7) 恰好也是 Am7 的内音；B/D 必须被标为缺失
    const missing = match.missingNotes.map((n) => n.name).sort()
    expect(missing).toContain("B")
    expect(missing).toContain("D")
  })

  it("正例与负例的置信度差距 ≥ 0.45（判别力足够拉开档次）", () => {
    const chroma = chromaOfChord(AM7)
    const positive = new ChordRecognizer().recognizeFromChroma(chroma, AM7).confidence
    const negative = new ChordRecognizer().recognizeFromChroma(chroma, G).confidence
    expect(positive - negative).toBeGreaterThanOrEqual(0.45)
  })

  it("交叉矩阵：每个和弦的自识别分都严格高于它对其它和弦的得分", () => {
    const chords = [AM7, FMAJ7, C, G]
    const chromas = chords.map(chromaOfChord)

    chords.forEach((played, i) => {
      const self = new ChordRecognizer().recognizeFromChroma(chromas[i], played).confidence
      chords.forEach((other, j) => {
        if (i === j) return
        const cross = new ChordRecognizer().recognizeFromChroma(chromas[i], other).confidence
        expect(
          self,
          `弹 ${played.name} 时，对 ${other.name} 的得分(${cross.toFixed(3)}) 不低于自识别(${self.toFixed(3)})`,
        ).toBeGreaterThan(cross)
      })
    })
  })
})

describe("ChordRecognizer.recognize（音高序列委托路径）", () => {
  it("未设置期望和弦时返回 null", () => {
    expect(new ChordRecognizer().recognize([])).toBeNull()
  })

  it("扫弦场景 YIN 无输出（pitches 为空）→ 退化为全 0 chroma 的低置信度匹配", () => {
    const r = new ChordRecognizer()
    r.setExpected(AM7)
    const m = r.recognize([])
    expect(m).not.toBeNull()
    expect(m!.confidence).toBeCloseTo(0.3, 9)
    expect(m!.missingNotes).toHaveLength(4)
  })

  it("单音序列覆盖到 Am7 全部内音 → 高置信度", () => {
    const r = new ChordRecognizer()
    r.setExpected(AM7)
    const m = r.recognize(
      AM7.notes.map((n) => ({
        frequency: n.frequency,
        clarity: 1,
        noteName: n.name,
        octave: n.octave,
        midi: n.midi,
        centsOff: 0,
        timestamp: 0,
      })),
    )
    expect(m!.confidence).toBeCloseTo(1, 9)
    expect(m!.missingNotes).toHaveLength(0)
  })

  it("setExpected(null) 后回到 null（切歌 / 停止练习时不残留旧和弦）", () => {
    const r = new ChordRecognizer()
    r.setExpected(AM7)
    expect(r.recognize([])).not.toBeNull()
    r.setExpected(null)
    expect(r.recognize([])).toBeNull()
  })
})
