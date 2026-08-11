/**
 * Audio Store — 硬件与引擎状态（DEVELOPMENT_PLAN §1.4）
 *
 * 职责边界：**只放低频、离散的硬件/引擎状态**。
 * 每帧数据（AudioFrame / PitchResult）一律走 `AudioBus`，绝不进这里。
 *
 * 本 store 同时是缺陷 D3 的修复关键：
 * `useAudioEngine` 过去把引擎实例塞在 `useRef` 里返回，首帧恒为 null，
 * 且引擎创建后不会触发重渲染。现在改为「模块级单例 + engineReady 驱动重渲染」。
 *
 * 不持久化。
 */

import { create } from "zustand"
import { MIN_DBFS } from "@/lib/audio/constants"
import type { AudioEngineState, AudioSourceKind } from "@/lib/audio/types"
import type { AudioMode } from "@/lib/audio/audioMode"

/** 麦克风权限状态 */
export type MicPermission = "unknown" | "granted" | "denied"

interface AudioState {
  // ---- 引擎 ----
  /** 引擎单例是否已创建（首次用户手势后为 true）。组件靠它拿到非 null 的 engine。 */
  engineReady: boolean
  /** AudioContext 生命周期状态 */
  engineState: AudioEngineState
  /** 当前输入源类型 */
  inputSource: AudioSourceKind

  // ---- 麦克风 ----
  permission: MicPermission
  deviceLabel: string | null
  /** 最近一次音频相关错误的可读描述 */
  lastError: string | null

  // ---- 采集 ----
  /** 检测循环是否在跑 */
  detecting: boolean
  /**
   * 输入电平（dBFS）。
   * ⚠️ 低频通道：由检测循环按 STORE_LEVEL_INTERVAL_MS（250ms）节流写入，
   * 仅供粗粒度指示使用。需要实时电平的 UI 请读 AudioBus 的 AudioFrame.levelDb。
   */
  inputLevelDb: number

  // ---- 演示模式 ----
  /** 非 null 表示正在使用合成音源（顶部显示 DEMO AUDIO 标签） */
  synthMode: AudioMode | null

  // ---- actions ----
  setEngineReady: (ready: boolean) => void
  setEngineState: (state: AudioEngineState) => void
  setInputSource: (source: AudioSourceKind) => void
  setPermission: (permission: MicPermission) => void
  setDeviceLabel: (label: string | null) => void
  setLastError: (message: string | null) => void
  setDetecting: (detecting: boolean) => void
  setInputLevelDb: (levelDb: number) => void
  setSynthMode: (mode: AudioMode | null) => void
  resetAudioState: () => void
}

const INITIAL_STATE = {
  engineReady: false,
  engineState: "idle" as AudioEngineState,
  inputSource: "none" as AudioSourceKind,
  permission: "unknown" as MicPermission,
  deviceLabel: null as string | null,
  lastError: null as string | null,
  detecting: false,
  inputLevelDb: MIN_DBFS,
  synthMode: null as AudioMode | null,
}

export const useAudioStore = create<AudioState>((set) => ({
  ...INITIAL_STATE,

  setEngineReady: (engineReady) => set({ engineReady }),
  setEngineState: (engineState) => set({ engineState }),
  setInputSource: (inputSource) => set({ inputSource }),
  setPermission: (permission) => set({ permission }),
  setDeviceLabel: (deviceLabel) => set({ deviceLabel }),
  setLastError: (lastError) => set({ lastError }),
  setDetecting: (detecting) => set({ detecting }),
  setInputLevelDb: (inputLevelDb) => set({ inputLevelDb }),
  setSynthMode: (synthMode) => set({ synthMode }),
  resetAudioState: () => set({ ...INITIAL_STATE }),
}))
