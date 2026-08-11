/**
 * Library Store — 歌曲库
 *
 * 用 zustand persist 中间件持久化到 localStorage。
 * 管理：用户导入的歌曲列表 + 内置示例曲谱。
 */

import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { Score } from "@/lib/music/types"
import { SLOW_DANCING_SCORE } from "@/lib/music/scores/slowDancing"

/** 媒体库中的歌曲条目 */
export interface LibrarySong {
  id: string
  title: string
  artist: string
  instrument: string
  added: string
  /** 关联的曲谱 ID（如果有结构化曲谱） */
  scoreId?: string
  /** 导入的音频文件名（如果用户上传了音频） */
  audioFileName?: string
}

interface LibraryState {
  /** 用户导入的歌曲 */
  songs: LibrarySong[]
  /** 内置曲谱库（scoreId → Score） */
  builtinScores: Record<string, Score>

  // actions
  addSong: (song: LibrarySong) => void
  removeSong: (id: string) => void
  getScore: (scoreId: string) => Score | undefined
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      songs: [
        {
          id: "slow-dancing",
          title: "Slow Dancing in a Burning Room",
          artist: "John Mayer",
          instrument: "Guitar",
          added: "Today",
          scoreId: "slow-dancing",
        },
      ],
      builtinScores: {
        "slow-dancing": SLOW_DANCING_SCORE,
      },

      addSong: (song) =>
        set((s) => ({ songs: [song, ...s.songs] })),
      removeSong: (id) =>
        set((s) => ({ songs: s.songs.filter((x) => x.id !== id) })),
      getScore: (scoreId) => get().builtinScores[scoreId],
    }),
    {
      name: "fretflow-songs",
      // 只持久化 songs，不持久化 builtinScores（代码内置）
      partialize: (state) => ({ songs: state.songs }),
    },
  ),
)
