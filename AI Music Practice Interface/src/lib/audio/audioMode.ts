/**
 * URL 音频注入通道（DEVELOPMENT_PLAN §1.8 L2 / Phase 1 T1.9）
 *
 * 沙箱内 `getUserMedia` 不可用，因此必须能用 URL 参数把合成音源接到分析链上：
 *   - `?audio=synth`     内置 Slow Dancing 和弦序列合成音（完整链路演示）
 *   - `?audio=osc:440`   纯 440Hz 正弦（校准用，PitchMonitor 应稳定显示 A4 / 0 cents）
 *
 * 解析函数是纯函数，可单测；读 `window.location` 的那层单独隔离。
 */

import { SAMPLE_RATE_FALLBACK } from "@/lib/audio/constants"
import { renderStrumSequence, type StrumEvent } from "@/lib/audio/testing/syntheticAudio"
import type { SyntheticSourceSpec } from "@/lib/audio/types"
import { SLOW_DANCING_SCORE } from "@/lib/music/scores/slowDancing"
import { flattenMeasures } from "@/lib/music/types"

/** URL 指定的演示音频模式 */
export type AudioMode =
  | { kind: "synth" }
  | { kind: "oscillator"; freqHz: number }

/** `?audio=osc:<hz>` 的默认频率（参数缺省或非法时使用） */
export const DEFAULT_OSC_FREQ_HZ = 440

/** 演示模式允许的振荡器频率范围（超出范围视为非法，回落到默认值） */
const OSC_MIN_HZ = 20
const OSC_MAX_HZ = 8000

/**
 * 解析 URL query string —— **纯函数**。
 *
 * @param search 形如 `"?audio=osc:440"` 或 `"audio=synth"`
 * @returns 演示模式；未指定或无法识别时返回 null（= 走真实麦克风）
 */
export function parseAudioModeParam(search: string): AudioMode | null {
  if (!search) return null
  const normalized = search.startsWith("?") ? search.slice(1) : search
  const params = new URLSearchParams(normalized)
  const raw = params.get("audio")
  if (!raw) return null

  const value = raw.trim().toLowerCase()
  if (value === "synth") return { kind: "synth" }

  if (value.startsWith("osc")) {
    const separatorIndex = value.indexOf(":")
    if (separatorIndex < 0) return { kind: "oscillator", freqHz: DEFAULT_OSC_FREQ_HZ }
    const parsed = Number.parseFloat(value.slice(separatorIndex + 1))
    const freqHz =
      Number.isFinite(parsed) && parsed >= OSC_MIN_HZ && parsed <= OSC_MAX_HZ
        ? parsed
        : DEFAULT_OSC_FREQ_HZ
    return { kind: "oscillator", freqHz }
  }

  return null
}

/**
 * 从当前页面 URL 读取演示模式。
 * SSR / node 环境下 `window` 不存在，返回 null。
 */
export function getAudioModeFromLocation(): AudioMode | null {
  if (typeof window === "undefined") return null
  return parseAudioModeParam(window.location.search)
}

/**
 * 构建"内置 Slow Dancing 和弦序列"的时域波形。
 *
 * 每小节一次扫弦，弦与弦之间 14ms 间隔（近似真实下扫）。
 * 曲谱 BPM 92、4/4 → 每小节 60/92*4 ≈ 2609ms。
 * 为了控制内存，只渲染前 `maxMeasures` 个小节并循环播放。
 *
 * @param sampleRate  采样率（传 `AudioContext.sampleRate`）
 * @param maxMeasures 渲染的小节数（默认 4，约 10.4 秒）
 */
export function buildDemoChordBuffer(
  sampleRate: number = SAMPLE_RATE_FALLBACK,
  maxMeasures: number = 4,
): Float32Array<ArrayBuffer> {
  const score = SLOW_DANCING_SCORE
  const measures = flattenMeasures(score.sections).slice(0, Math.max(1, maxMeasures))
  const beatMs = (60 / score.bpm) * 1000

  let cursorMs = 0
  const events: StrumEvent[] = []
  for (const measure of measures) {
    const freqsHz = measure.chord.notes.map((note) => note.frequency)
    // 每小节扫两次（第 1 拍与第 3 拍），更接近真实弹唱节奏，也让 onset 检测有东西可测
    events.push({ atMs: cursorMs, freqsHz, amplitude: 0.55, spreadMs: 14 })
    events.push({ atMs: cursorMs + beatMs * 2, freqsHz, amplitude: 0.45, spreadMs: 14 })
    cursorMs += beatMs * measure.beats
  }

  return renderStrumSequence(events, sampleRate, cursorMs)
}

/**
 * 把 `AudioMode` 转成 AudioEngine 能直接吃的 `SyntheticSourceSpec`。
 *
 * @param mode       演示模式
 * @param sampleRate 采样率
 */
export function buildSyntheticSpec(mode: AudioMode, sampleRate: number): SyntheticSourceSpec {
  if (mode.kind === "oscillator") {
    return { kind: "oscillator", freqHz: mode.freqHz, gain: 0.5 }
  }
  return {
    kind: "buffer",
    samples: buildDemoChordBuffer(sampleRate),
    loop: true,
    gain: 0.9,
  }
}

/** 顶部 DEMO AUDIO 标签上显示的说明文字 */
export function describeAudioMode(mode: AudioMode): string {
  return mode.kind === "oscillator"
    ? `OSC ${mode.freqHz.toFixed(0)} Hz`
    : "SYNTH CHORDS"
}
