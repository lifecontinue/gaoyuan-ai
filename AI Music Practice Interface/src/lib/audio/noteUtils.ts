/**
 * 音高工具函数 — 频率 ↔ MIDI ↔ 音名 互转
 *
 * 基于十二平均律，A4 = 440Hz = MIDI 69。
 */

import type { Note, NoteName } from "@/lib/music/types"

/** 音名序列（按升序） */
export const NOTE_NAMES: readonly NoteName[] = [
  "C", "C#", "D", "D#", "E", "F",
  "F#", "G", "G#", "A", "A#", "B",
] as const

/** A4 参考频率 */
export const A4_FREQUENCY = 440
/** A4 的 MIDI 编号 */
export const A4_MIDI = 69

/**
 * 频率 → MIDI 编号（浮点，含 cents 信息）
 * midi = 69 + 12 * log2(f / 440)
 */
export function frequencyToMidi(frequency: number): number {
  return A4_MIDI + 12 * Math.log2(frequency / A4_FREQUENCY)
}

/**
 * MIDI 编号 → 频率
 */
export function midiToFrequency(midi: number): number {
  return A4_FREQUENCY * Math.pow(2, (midi - A4_MIDI) / 12)
}

/**
 * MIDI 编号 → 音名 + 八度
 * 八度规则：MIDI 0 = C-1，MIDI 60 = C4（中央 C）
 */
export function midiToNoteName(midi: number): { name: NoteName; octave: number } {
  const rounded = Math.round(midi)
  const name = NOTE_NAMES[((rounded % 12) + 12) % 12]
  const octave = Math.floor(rounded / 12) - 1
  return { name, octave }
}

/**
 * 音名 + 八度 → MIDI 编号
 */
export function noteNameToMidi(name: NoteName, octave: number): number {
  const index = NOTE_NAMES.indexOf(name)
  return (octave + 1) * 12 + index
}

/**
 * 频率 → 完整 Note 对象
 */
export function frequencyToNote(frequency: number): Note {
  const midiFloat = frequencyToMidi(frequency)
  const midi = Math.round(midiFloat)
  const { name, octave } = midiToNoteName(midi)
  return {
    name,
    octave,
    midi,
    frequency: midiToFrequency(midi),
  }
}

/**
 * 计算音分偏差（cents off）
 * @param frequency 实际频率
 * @param midi 目标 MIDI（整数）
 * @returns -50 ~ +50 的 cents 偏差，正数=偏高
 */
export function centsOff(frequency: number, midi: number): number {
  const targetFreq = midiToFrequency(midi)
  return 1200 * Math.log2(frequency / targetFreq)
}

/**
 * 判断两个音名是否同一个 pitch class（忽略八度）
 */
export function isSamePitchClass(a: NoteName, b: NoteName): boolean {
  return a === b
}

/**
 * 吉他标准调弦下，给定弦号和品格，计算对应音高的 MIDI
 * @param stringIndex 0=低音 E 弦, 5=高音 e 弦
 * @param fret 品格（0=空弦）
 * @param tuning 调弦（默认标准调弦）
 */
export function fretToMidi(
  stringIndex: number,
  fret: number,
  tuning: number[] = [40, 45, 50, 55, 59, 64],
): number {
  return tuning[stringIndex] + fret
}
