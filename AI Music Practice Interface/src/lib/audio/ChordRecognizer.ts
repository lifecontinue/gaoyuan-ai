/**
 * ChordRecognizer — 和弦识别（DEVELOPMENT_PLAN §4 / §1.7）
 *
 * 为什么和弦判定不能用 YIN：
 * 扫弦时 6 根弦同时发声，YIN 是**单音基频**算法，输出没有意义。因此：
 *   - **单音段落**（confirmedNotes 非空）→ 用 cents 判音准
 *   - **和弦 / 扫弦**（YIN 无稳定输出）→ 用 **chroma 能量匹配**判和弦
 * 这就是 §1.7 中 pitchAccuracy 双分支公式的由来 —— 不是权宜之计，是正确的做法。
 *
 * 本文件新增 `recognizeFromChroma(chroma, expected): ChordMatch`（引导式主路径）；
 * 旧 `recognize(pitches)` 保留为委托。
 */

import type { Chord, Note } from "@/lib/music/types"
import type { PitchResult } from "@/lib/audio/PitchDetector"
import { CHROMA_EXTRA_THRESHOLD, CHROMA_MATCH_THRESHOLD } from "@/lib/audio/constants"
import { midiToFrequency, midiToNoteName } from "@/lib/audio/noteUtils"

/** 和弦匹配结果 */
export interface ChordMatch {
  /** 匹配到的和弦 */
  chord: Chord
  /** 置信度 0-1 */
  confidence: number
  /** 匹配到的内音 */
  matchedNotes: Note[]
  /** 缺失的内音 */
  missingNotes: Note[]
  /** 多出的音（不在和弦内） */
  extraNotes: Note[]
}

/** 音名的音级索引（0-11） */
function pitchClassOf(note: Note): number {
  const pc = note.midi % 12
  return pc < 0 ? pc + 12 : pc
}

/** 由音级索引构造一个占位 Note（用于 extraNotes，无真实八度语义） */
function noteFromPitchClass(pc: number): Note {
  const midi = pc + 60 // 落到八度 4 区，仅用于展示
  const { name, octave } = midiToNoteName(midi)
  return { name, octave, midi, frequency: midiToFrequency(midi) }
}

export class ChordRecognizer {
  private expected: Chord | null = null

  constructor() {}

  /** 设置期望和弦（引导式模式） */
  setExpected(chord: Chord | null): void {
    this.expected = chord
  }

  /**
   * 引导式和弦识别：比对 chroma 与期望和弦的音级能量（§1.7 ③）。
   *
   *   matched = { pc ∈ expectedPCs : chroma[pc] ≥ CHROMA_MATCH_THRESHOLD }
   *   extra   = { pc ∉ expectedPCs : chroma[pc] ≥ CHROMA_EXTRA_THRESHOLD }
   *   confidence = 0.7·(|matched| / |expectedPCs|) + 0.3·(1 - min(1, |extra| / 3))
   *
   * @param chroma   12 维音级能量（归一化到 max = 1）
   * @param expected 期望和弦（已知）
   */
  recognizeFromChroma(chroma: ArrayLike<number>, expected: Chord): ChordMatch {
    const expectedPCs = expected.notes.map(pitchClassOf)
    const expectedSet = new Set(expectedPCs)

    const matchedPCs: number[] = []
    const extraPCs: number[] = []
    for (let pc = 0; pc < 12; pc += 1) {
      const energy = chroma[pc]
      if (expectedSet.has(pc)) {
        if (energy >= CHROMA_MATCH_THRESHOLD) matchedPCs.push(pc)
      } else if (energy >= CHROMA_EXTRA_THRESHOLD) {
        extraPCs.push(pc)
      }
    }

    const confidence =
      0.7 * (matchedPCs.length / expectedPCs.length) +
      0.3 * (1 - Math.min(1, extraPCs.length / 3))

    const matchedNotes = expected.notes.filter((n) => matchedPCs.includes(pitchClassOf(n)))
    const missingNotes = expected.notes.filter((n) => !matchedPCs.includes(pitchClassOf(n)))
    const extraNotes = extraPCs.map(noteFromPitchClass)

    return { chord: expected, confidence, matchedNotes, missingNotes, extraNotes }
  }

  /**
   * 从音高序列识别和弦（骨架接口，委托给 recognizeFromChroma）。
   *
   * 把确认音的 pitch class 累加成一个 chroma 向量，再与期望和弦比对。
   * 扫弦场景 YIN 无稳定输出 → pitches 为空 → chroma 全 0 → 低置信度的退化匹配。
   *
   * @param pitches   一段时间窗内的音高检测结果
   * @param _windowMs 时间窗（保留签名，本实现按帧聚合）
   */
  recognize(pitches: PitchResult[], _windowMs: number = 500): ChordMatch | null {
    if (!this.expected) return null

    const chroma = new Float32Array(12)
    for (const p of pitches) {
      const pc = ((Math.round(p.midi) % 12) + 12) % 12
      chroma[pc] += 1
    }
    let max = 0
    for (let i = 0; i < 12; i += 1) if (chroma[i] > max) max = chroma[i]
    if (max > 0) for (let i = 0; i < 12; i += 1) chroma[i] /= max

    return this.recognizeFromChroma(chroma, this.expected)
  }
}
