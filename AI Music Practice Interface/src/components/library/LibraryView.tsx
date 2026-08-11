/**
 * LibraryView — 媒体库视图
 *
 * 展示歌曲列表，支持导入新歌曲。
 * 数据来自 libraryStore + sessionStore（视图切换）。
 */

import { useRef } from "react"
import { useLibraryStore, type LibrarySong } from "@/lib/store/libraryStore"
import { useSessionStore } from "@/lib/store/sessionStore"

export function LibraryView() {
  const songs = useLibraryStore((s) => s.songs)
  const addSongToLibrary = useLibraryStore((s) => s.addSong)
  const setView = useSessionStore((s) => s.setView)
  const fileInput = useRef<HTMLInputElement>(null)

  const handleImport = (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    const song: LibrarySong = {
      id: `imported-${Date.now()}`,
      title: file.name.replace(/\.[^/.]+$/, ""),
      artist: "Imported track",
      added: "Just now",
      instrument: "Guitar",
      audioFileName: file.name,
    }
    addSongToLibrary(song)
    setView("practice")
  }

  return (
    <section className="library">
      <div className="library-heading">
        <div>
          <span className="eyebrow">YOUR MUSIC</span>
          <h2>Practice library</h2>
          <p>Imported songs are saved locally on this device.</p>
        </div>
        <button className="add-song large" onClick={() => fileInput.current?.click()}>
          + IMPORT A SONG
        </button>
        <input
          ref={fileInput}
          className="file-input"
          type="file"
          accept="audio/*"
          onChange={(e) => handleImport(e.target.files)}
        />
      </div>
      <div className="song-list">
        {songs.map((song, index) => (
          <button
            className="song-row"
            key={`${song.id}-${index}`}
            onClick={() => setView("practice")}
          >
            <div className="song-art">♫</div>
            <div>
              <strong>{song.title}</strong>
              <span>
                {song.artist} · {song.instrument}
              </span>
            </div>
            <time>{song.added}</time>
            <em>Practice →</em>
          </button>
        ))}
      </div>
    </section>
  )
}
