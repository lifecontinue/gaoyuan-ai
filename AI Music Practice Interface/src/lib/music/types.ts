/**
 * 音乐数据模型 — FRET FLOW
 *
 * 定义曲谱、和弦、小节、乐器等核心类型。
 * 吉他专用：FretValue / GuitarFingering。
 * 设计为可扩展多乐器（piano/bass/ukulele）。
 */

/** 十二平均律音名（不含八度） */
export type NoteName =
  | "C" | "C#" | "D" | "D#" | "E" | "F"
  | "F#" | "G" | "G#" | "A" | "A#" | "B"

/** 一个具体音高（含音名、八度、MIDI 编号、频率） */
export interface Note {
  name: NoteName
  octave: number
  midi: number
  frequency: number
}

/** 品格值：数字=品格，0=空弦，'x'=闷音/不弹 */
export type FretValue = number | "x"

/** 吉他指法（6 弦，从低音 E 到高音 e） */
export interface GuitarFingering {
  /** 6 个弦的品格，索引 0=低音 E 弦，5=高音 e 弦 */
  strings: [FretValue, FretValue, FretValue, FretValue, FretValue, FretValue]
  /** 每弦对应的手指编号（0=空弦不按，1=食指，2=中指，3=无名指，4=小指） */
  fingers?: [number, number, number, number, number, number]
  /** 横按 */
  barre?: { fret: number; fromString: number; toString: number }
}

/** 和弦性质 */
export type ChordQuality =
  | "maj" | "min" | "7" | "maj7" | "m7"
  | "dim" | "aug" | "sus2" | "sus4"

/** 和弦定义 */
export interface Chord {
  /** 和弦名，如 'Am7'、'Fmaj7' */
  name: string
  /** 根音音名 */
  root: NoteName
  /** 和弦性质 */
  quality: ChordQuality
  /** 和弦内音（含完整音高信息） */
  notes: Note[]
  /** 吉他指法（可选，钢琴等其他乐器无此字段） */
  guitarFingering?: GuitarFingering
}

/** 小节 */
export interface Measure {
  /** 小节编号（全局唯一） */
  id: number
  /** 该小节的和弦 */
  chord: Chord
  /** 该小节的拍数（默认 4，3/4 拍为 3） */
  beats: number
}

/** 乐段（如 Verse、Chorus、Bridge） */
export interface Section {
  id: string
  name: string
  measures: Measure[]
}

/** 完整曲谱 */
export interface Score {
  id: string
  title: string
  artist: string
  /** 原曲 BPM */
  bpm: number
  /** 拍号，如 [4,4] 表示 4/4 */
  timeSignature: [number, number]
  sections: Section[]
  /** 变调夹品位（吉他专用，0=不用） */
  capo?: number
  /** 调弦（吉他专用，默认标准调弦 EADGBE） */
  tuning?: Note[]
}

/** 乐器类型（预留多乐器扩展） */
export interface Instrument {
  kind: "guitar" | "piano" | "bass" | "ukulele"
  /** 弦数（弦乐器） */
  strings?: number
  /** 调弦（弦乐器） */
  tuning?: Note[]
}

/** 标准吉他调弦：E2 A2 D3 G3 B3 E4（低→高） */
export const STANDARD_GUITAR_TUNING: Note[] = [
  { name: "E", octave: 2, midi: 40, frequency: 82.41 },
  { name: "A", octave: 2, midi: 45, frequency: 110.0 },
  { name: "D", octave: 3, midi: 50, frequency: 146.83 },
  { name: "G", octave: 3, midi: 55, frequency: 196.0 },
  { name: "B", octave: 3, midi: 59, frequency: 246.94 },
  { name: "E", octave: 4, midi: 64, frequency: 329.63 },
]

/** 工具：从 Section[] 展平为 Measure[] */
export function flattenMeasures(sections: Section[]): Measure[] {
  return sections.flatMap((s) => s.measures)
}

/** 工具：根据 measureId 查找所在 Section */
export function findSectionByMeasure(
  sections: Section[],
  measureId: number,
): Section | undefined {
  return sections.find((s) => s.measures.some((m) => m.id === measureId))
}
