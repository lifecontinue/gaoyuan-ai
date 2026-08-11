/**
 * 乐理工具 — 和弦模板库 + 和弦构建
 *
 * 提供从根音+性质构建完整 Chord 的工具。
 * Phase 0 仅提供基础和弦类型，Phase 4 可扩展。
 */

import type { Chord, ChordQuality, Note, NoteName } from "@/lib/music/types"
import { noteNameToMidi, midiToFrequency, midiToNoteName } from "@/lib/audio/noteUtils"

/** 和弦性质 → 半音音程（相对根音） */
export const CHORD_INTERVALS: Record<ChordQuality, number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
}

/** 和弦名后缀 → quality 的解析表（按长度降序匹配，先匹配长后缀） */
const CHORD_NAME_SUFFIXES: Array<[string, ChordQuality]> = [
  ["maj7", "maj7"],
  ["m7", "m7"],
  ["sus4", "sus4"],
  ["sus2", "sus2"],
  ["dim", "dim"],
  ["aug", "aug"],
  ["7", "7"],
  ["m", "min"],
  ["", "maj"], // 无后缀 = 大三和弦
]

/** 音名 → pitch class（0-11） */
const NOTE_NAME_TO_PC: Record<NoteName, number> = {
  C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5,
  "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11,
}

/**
 * 解析和弦名 → {root, quality}
 * @example parseChordName("Am7") → {root:"A", quality:"m7"}
 * @example parseChordName("Fmaj7") → {root:"F", quality:"maj7"}
 * @example parseChordName("C") → {root:"C", quality:"maj"}
 */
export function parseChordName(name: string): { root: NoteName; quality: ChordQuality } | null {
  if (!name) return null
  const rootChar = name[0]
  const rootNames: NoteName[] = ["C", "D", "E", "F", "G", "A", "B"]
  if (!rootNames.includes(rootChar as NoteName)) return null

  let root: NoteName = rootChar as NoteName
  let rest = name.slice(1)

  // 处理升号
  if (rest.startsWith("#")) {
    root = (root + "#") as NoteName
    rest = rest.slice(1)
  }

  // 匹配后缀
  for (const [suffix, quality] of CHORD_NAME_SUFFIXES) {
    if (rest === suffix || (suffix && rest.startsWith(suffix))) {
      // 精确匹配后缀（rest 应该等于 suffix 或 suffix 后无更多字符）
      if (rest === suffix) {
        return { root, quality }
      }
    }
  }

  // 兜底：无后缀 = 大三和弦
  if (rest === "") return { root, quality: "maj" }
  return null
}

/**
 * 构建完整和弦对象（含 notes）
 * @param name 和弦名，如 "Am7"
 * @param rootOctave 根音八度（默认 3，即 A3=220Hz 附近的 Am7）
 * @param guitarFingering 可选的吉他指法
 */
export function buildChord(
  name: string,
  rootOctave: number = 3,
  guitarFingering?: Chord["guitarFingering"],
): Chord {
  const parsed = parseChordName(name)
  if (!parsed) {
    throw new Error(`Cannot parse chord name: ${name}`)
  }

  const rootMidi = noteNameToMidi(parsed.root, rootOctave)
  const intervals = CHORD_INTERVALS[parsed.quality]

  const notes: Note[] = intervals.map((interval) => {
    const midi = rootMidi + interval
    const { name: n, octave } = midiToNoteName(midi)
    return { name: n, octave, midi, frequency: midiToFrequency(midi) }
  })

  return {
    name,
    root: parsed.root,
    quality: parsed.quality,
    notes,
    guitarFingering,
  }
}
