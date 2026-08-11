/**
 * useAudioEngine — AudioEngine 单例管理（Phase 1 重写，修复缺陷 D3）
 *
 * ## D3 是什么
 * 旧实现把引擎放在 `useRef` 里并 `return { engine: engineRef.current }`：
 *   1. 首次渲染时 ref 恒为 null，消费组件永远拿不到引擎；
 *   2. 在事件回调里创建引擎只改 ref，**不触发重渲染**，组件永远不会重新拿到它。
 *
 * ## 修法
 * 引擎降为**模块级单例**（React 生命周期之外），创建/销毁时写 `audioStore.engineReady`，
 * 由 store 订阅驱动重渲染。这样任何组件在任何时刻调用本 hook 都能拿到一致的实例。
 *
 * ## 状态机（§1.3）
 * 所有 FlowState 迁移收敛在这里，组件只负责调用意图函数（requestMic / startDemo / stopAudio）。
 */

import { useCallback } from "react"
import { AudioEngine } from "@/lib/audio/AudioEngine"
import { buildSyntheticSpec, getAudioModeFromLocation, type AudioMode } from "@/lib/audio/audioMode"
import { audioBus } from "@/lib/audio/AudioBus"
import { useAudioStore } from "@/lib/store/audioStore"
import { useSessionStore } from "@/lib/store/sessionStore"

/** 模块级单例 —— 整个应用只有一个 AudioContext */
let engineSingleton: AudioEngine | null = null
/** 单例的状态订阅取消函数 */
let unsubscribeEngineState: (() => void) | null = null

/**
 * 取得（或惰性创建）AudioEngine 单例。
 *
 * ⚠️ 必须在**用户手势的同步调用栈内**首次调用，否则 AudioContext 会一直是 suspended。
 */
export function getAudioEngine(): AudioEngine {
  if (engineSingleton && !engineSingleton.disposed) return engineSingleton

  const engine = new AudioEngine()
  engineSingleton = engine
  unsubscribeEngineState = engine.onStateChange((state) => {
    useAudioStore.getState().setEngineState(state)
  })
  // 这一行是 D3 修复的核心：store 变化会驱动所有消费组件重渲染，
  // 从而在下一帧拿到非 null 的 engine。
  useAudioStore.getState().setEngineReady(true)
  return engine
}

/** 当前单例（未创建时为 null）。仅供不需要触发创建的只读场景使用。 */
export function peekAudioEngine(): AudioEngine | null {
  return engineSingleton && !engineSingleton.disposed ? engineSingleton : null
}

/** 销毁单例并复位 audioStore */
export function disposeAudioEngine(): void {
  unsubscribeEngineState?.()
  unsubscribeEngineState = null
  engineSingleton?.dispose()
  engineSingleton = null
  audioBus.clear()
  useAudioStore.getState().resetAudioState()
}

/** 把未知异常转成可读文案 */
function describeMicError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "NotAllowedError") return "麦克风权限被拒绝"
    if (error.name === "NotFoundError") return "未检测到可用的音频输入设备"
    if (error.name === "NotReadableError") return "麦克风被其它应用占用"
    return error.message
  }
  return "无法访问麦克风"
}

export function useAudioEngine() {
  const engineReady = useAudioStore((s) => s.engineReady)
  const engineState = useAudioStore((s) => s.engineState)
  const permission = useAudioStore((s) => s.permission)
  const inputSource = useAudioStore((s) => s.inputSource)
  const synthMode = useAudioStore((s) => s.synthMode)
  const lastError = useAudioStore((s) => s.lastError)

  // engineReady 变化会触发重渲染 → 这里才能返回到真实实例（D3 修复的可观测点）
  const engine = engineReady ? peekAudioEngine() : null

  /**
   * 请求麦克风并开始监听。**必须在用户手势内调用。**
   *
   * 顺序不可颠倒：`engine.start()`（resume，必须同步）→ `await getUserMedia()`。
   */
  const requestMic = useCallback(async (): Promise<boolean> => {
    const audio = useAudioStore.getState()
    const session = useSessionStore.getState()
    session.setFlowState("requesting_mic")
    try {
      const instance = getAudioEngine()
      instance.start()
      const stream = await instance.requestMic()
      audio.setPermission("granted")
      audio.setDeviceLabel(stream.getAudioTracks()[0]?.label ?? null)
      audio.setInputSource(instance.inputSource)
      audio.setSynthMode(null)
      audio.setLastError(null)
      session.setFlowState("listening")
      return true
    } catch (error) {
      const message = describeMicError(error)
      audio.setPermission("denied")
      audio.setLastError(message)
      audio.setInputSource("none")
      session.setFlowState("error", "mic_error")
      return false
    }
  }, [])

  /**
   * 启动演示模式（合成音源）。
   * 既是沙箱验收通道（`?audio=synth` / `?audio=osc:440`），
   * 也是麦克风被拒绝时的降级路径（§1.5）。
   */
  const startDemo = useCallback(async (mode?: AudioMode): Promise<boolean> => {
    const audio = useAudioStore.getState()
    const session = useSessionStore.getState()
    const resolved: AudioMode = mode ?? getAudioModeFromLocation() ?? { kind: "synth" }
    try {
      const instance = getAudioEngine()
      instance.start()
      instance.attachSyntheticSource(buildSyntheticSpec(resolved, instance.context.sampleRate))
      audio.setSynthMode(resolved)
      audio.setInputSource(instance.inputSource)
      audio.setLastError(null)
      session.setFlowState("listening")
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : "无法启动演示音源"
      audio.setLastError(message)
      // 注意不能报 mic_error：那会让 UI 提供"切换到演示模式"，把用户导回刚失败的同一条路径
      session.setFlowState("error", "audio_error")
      return false
    }
  }, [])

  /** 停止采集（保留 AudioContext，便于再次开始） */
  const stopAudio = useCallback((): void => {
    const audio = useAudioStore.getState()
    const instance = peekAudioEngine()
    instance?.detachSource()
    instance?.stop()
    audio.setInputSource("none")
    audio.setSynthMode(null)
    audioBus.clear()
    useSessionStore.getState().setFlowState("stopped")
  }, [])

  /** 彻底释放（切歌 / 卸载时） */
  const dispose = useCallback((): void => {
    disposeAudioEngine()
  }, [])

  return {
    engine,
    ready: engineReady && engineState === "running",
    engineState,
    permission,
    inputSource,
    synthMode,
    micError: lastError,
    getEngine: getAudioEngine,
    requestMic,
    startDemo,
    stopAudio,
    dispose,
  }
}
