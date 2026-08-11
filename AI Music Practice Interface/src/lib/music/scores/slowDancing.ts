/**
 * 内置示例曲谱 — Slow Dancing in a Burning Room (John Mayer)
 *
 * 把原 App.tsx 硬编码的 measureRows 转为结构化 Score。
 * 小节 17-28，和弦进行：Am7 Fmaj7 C G × 2，Dm7 Am7 G C
 */

import type { Score, GuitarFingering } from "@/lib/music/types"
import { buildChord } from "@/lib/music/theory"

// 吉他指法（6弦，低音E→高音e）
const FINGERING_AM7: GuitarFingering = { strings: [5, 3, 2, 0, 1, 0] }
const FINGERING_FMAJ7: GuitarFingering = { strings: ["x", 3, 2, 2, 1, 0] }
const FINGERING_C: GuitarFingering = { strings: ["x", 3, 2, 0, 1, 0] }
const FINGERING_G: GuitarFingering = { strings: [3, 2, 0, 0, 0, 3] }
const FINGERING_DM7: GuitarFingering = { strings: ["x", 5, 3, 2, 1, 1] }

export const SLOW_DANCING_SCORE: Score = {
  id: "slow-dancing",
  title: "Slow Dancing in a Burning Room",
  artist: "John Mayer",
  bpm: 92,
  timeSignature: [4, 4],
  capo: 0,
  sections: [
    {
      id: "verse-2",
      name: "Verse 2",
      measures: [
        { id: 17, chord: buildChord("Am7", 2, FINGERING_AM7), beats: 4 },
        { id: 18, chord: buildChord("Fmaj7", 2, FINGERING_FMAJ7), beats: 4 },
        { id: 19, chord: buildChord("C", 3, FINGERING_C), beats: 4 },
        { id: 20, chord: buildChord("G", 3, FINGERING_G), beats: 4 },
        { id: 21, chord: buildChord("Am7", 2, FINGERING_AM7), beats: 4 },
        { id: 22, chord: buildChord("Fmaj7", 2, FINGERING_FMAJ7), beats: 4 },
        { id: 23, chord: buildChord("C", 3, FINGERING_C), beats: 4 },
        { id: 24, chord: buildChord("G", 3, FINGERING_G), beats: 4 },
        { id: 25, chord: buildChord("Dm7", 3, FINGERING_DM7), beats: 4 },
        { id: 26, chord: buildChord("Am7", 2, FINGERING_AM7), beats: 4 },
        { id: 27, chord: buildChord("G", 3, FINGERING_G), beats: 4 },
        { id: 28, chord: buildChord("C", 3, FINGERING_C), beats: 4 },
      ],
    },
  ],
}
