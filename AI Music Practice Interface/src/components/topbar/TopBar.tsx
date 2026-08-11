/**
 * TopBar — 顶部栏
 *
 * 包含：品牌、歌曲信息、进度条、HISTORY、ADD SONG。
 * 数据来自 sessionStore + libraryStore + transportStore。
 *
 * Phase 2 变更：
 *   - 删除 `02:41 / 05:14` 与 `width:51%` 两处设计稿硬编码，
 *     换成 ScoreFollower 的真实时间；
 *   - eyebrow 的 "VERSE 2 · BARS 17—28" 改为跟随当前乐段实时计算；
 *   - 🚨 进度条与已播时长**不走 React state**：它们每帧都在变（≈60Hz），
 *     每帧 setState 会把整个 App 重渲染（§1.4 渲染禁令）。
 *     这里订阅 TimelineBus，在回调里直接改 DOM —— 进度条改 `transform`
 *     （合成层，零重排），时钟文本只在 `mm:ss` 字符串**真的变了**时才写
 *     `textContent`（1Hz 量级，且不触发 React 协调）。
 */

import { useEffect, useMemo, useRef } from "react"

import { describeAudioMode } from "@/lib/audio/audioMode"
import { formatClock, progressRatio } from "@/lib/audio/ScoreFollower"
import { timelineBus } from "@/lib/audio/TimelineBus"
import { computeTotalMs } from "@/hooks/usePracticeSession"
import { useAudioStore } from "@/lib/store/audioStore"
import { useSessionStore } from "@/lib/store/sessionStore"
import { useLibraryStore, type LibrarySong } from "@/lib/store/libraryStore"
import { useTransportStore } from "@/lib/store/transportStore"
import { resolveScore } from "@/lib/music/activeScore"
import { buildEyebrow } from "@/lib/music/sectionLabel"

/**
 * 进度显示（时钟文本 + 进度条）。
 *
 * 拆成独立组件是为了把 TimelineBus 订阅的作用域收到最小：
 * 即便将来这里真的需要一次 setState，也只会重渲染这一小块。
 */
function SongProgress({ totalMs }: { totalMs: number }) {
  const elapsedRef = useRef<HTMLSpanElement>(null)
  const barRef = useRef<HTMLElement>(null)
  /** 上一次写进 DOM 的时钟文本，用于跳过 98% 的无意义写入 */
  const lastClockRef = useRef<string>("")

  const totalClock = formatClock(totalMs)

  useEffect(() => {
    const clockEl = elapsedRef.current
    const barEl = barRef.current
    if (!clockEl || !barEl) return

    // 曲谱 / 速度变了，重算一次基线，避免停在旧总时长算出的比例上
    lastClockRef.current = ""

    return timelineBus.subscribe((frame) => {
      const total = frame.totalMs > 0 ? frame.totalMs : totalMs
      const ratio = progressRatio(frame.elapsedMs, total)
      // scaleX 走合成层；写 width 会每帧触发布局，正是要避开的东西
      barEl.style.transform = `scaleX(${ratio.toFixed(5)})`

      const clock = formatClock(frame.elapsedMs)
      if (clock !== lastClockRef.current) {
        lastClockRef.current = clock
        clockEl.textContent = clock
      }
    })
  }, [totalMs])

  return (
    <div className="progress-stat">
      <div>
        <span>SONG PROGRESS</span>
        <b>
          <span ref={elapsedRef}>00:00</span> <em>/ {totalClock}</em>
        </b>
      </div>
      <div className="progress-line">
        <i ref={barRef} />
      </div>
    </div>
  )
}

export function TopBar() {
  const setView = useSessionStore((s) => s.setView)
  const currentScore = useSessionStore((s) => s.currentScore)
  const currentSectionId = useSessionStore((s) => s.currentSectionId)
  const addSongToLibrary = useLibraryStore((s) => s.addSong)
  const bpm = useTransportStore((s) => s.bpm)
  const speedPercent = useTransportStore((s) => s.speedPercent)
  // 合成音源在跑时必须在顶部醒目提示，避免把演示音误当成真实拾音（§1.8 / DoD #10）
  const synthMode = useAudioStore((s) => s.synthMode)
  const fileInput = useRef<HTMLInputElement>(null)

  const score = resolveScore(currentScore)
  const title = score.title
  const artist = score.artist

  // 总时长随 BPM / 变速实时折算 —— 50% 慢练时总长翻倍，这是真实的练习时长
  const totalMs = useMemo(
    () => computeTotalMs(score, bpm, speedPercent),
    [score, bpm, speedPercent],
  )
  const eyebrow = buildEyebrow(score, currentSectionId)

  const handleAddSong = (files: FileList | null) => {
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
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">♫</div>
        <span>
          FRET<span>FLOW</span>
        </span>
      </div>
      <div className="song-info">
        <div className="eyebrow">
          <span className="live-dot" /> {eyebrow}
        </div>
        <h1>{title}</h1>
        <p>{artist}</p>
      </div>
      {synthMode && (
        <div className="topbar-demo-tag" title="当前使用合成音源，非真实麦克风输入">
          DEMO AUDIO · {describeAudioMode(synthMode)}
        </div>
      )}
      <div className="top-stats">
        {/*
          key 绑在 score.id 上：换歌时 usePracticeSession 会 `timelineBus.clear()`，
          在下一帧到来之前没有任何事件能刷新 DOM —— 不重挂的话，上一首的
          `03:12` 会一直挂在新歌头上。改 BPM 不需要重挂（totalMs 走正常渲染）。
        */}
        <SongProgress key={score.id} totalMs={totalMs} />
        <button className="history-button" onClick={() => setView("library")}>
          HISTORY
        </button>
        <button className="add-song" onClick={() => fileInput.current?.click()}>
          + ADD SONG
        </button>
        <input
          ref={fileInput}
          className="file-input"
          type="file"
          accept="audio/*"
          onChange={(e) => handleAddSong(e.target.files)}
        />
      </div>
    </header>
  )
}
