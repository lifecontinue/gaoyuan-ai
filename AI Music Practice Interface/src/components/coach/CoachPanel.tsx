/**
 * CoachPanel — AI 教练面板
 *
 * 包含：流程步骤、状态机驱动的交互区、流式建议输出。
 * 数据来自 sessionStore（flowState / streamingText / advice）。
 *
 * Phase 1: START LISTENING 已接真实 `requestMic()`（原 1700ms setTimeout mock 已删除）；
 *          `listening → playing_along` 的迁移由 usePitchDetection 在检测到首个稳定音时触发。
 * Phase 4: 打字机部分替换为 DeepSeek API 调用。
 */

import { useRef } from "react"
import { useSessionStore, type FlowState } from "@/lib/store/sessionStore"
import { useTransportStore } from "@/lib/store/transportStore"
import { useAudioStore } from "@/lib/store/audioStore"
import { useAudioEngine } from "@/hooks/useAudioEngine"
import { getAudioModeFromLocation } from "@/lib/audio/audioMode"

/** 把 **bold** 标记转为 <strong> */
function formatAdvice(value: string) {
  return value.split("\n").map((line, index) => {
    const rich = line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    return <p key={index} dangerouslySetInnerHTML={{ __html: rich }} />
  })
}

/** Phase 0 mock: 模拟 AI 返回的练习建议文本 */
const MOCK_ADVICE_TEXT =
  "**Try this next:** prepare the Fmaj7 shape on beat 4.\n\nYour fretting hand arrives late after Am7. Keep the last strum lighter, then move your index finger before the next downbeat.\n\n- Loop **bars 18–20** for 20 seconds\n- Stay at **75%** until every change rings cleanly"

/** 状态对应的标题 */
function flowTitle(flow: FlowState): string {
  switch (flow) {
    case "idle":
      return "Ready to play"
    case "requesting_mic":
      return "Requesting microphone…"
    case "listening":
      return "Listening…"
    case "playing_along":
      return "Take captured"
    case "analyzing":
      return "Analyzing your playing…"
    case "streaming":
      return "Building your notes…"
    case "reviewed":
      return "Notes ready"
    case "error":
      return "Connection issue"
    default:
      return "Ready to play"
  }
}

export function CoachPanel() {
  const flowState = useSessionStore((s) => s.flowState)
  const setFlowState = useSessionStore((s) => s.setFlowState)
  const streamingText = useSessionStore((s) => s.streamingText)
  const appendStreamingText = useSessionStore((s) => s.appendStreamingText)
  const setPlaying = useTransportStore((s) => s.setPlaying)
  const errorType = useSessionStore((s) => s.errorType)
  const micError = useAudioStore((s) => s.lastError)
  const synthMode = useAudioStore((s) => s.synthMode)
  const { requestMic, startDemo } = useAudioEngine()
  const adviceTimer = useRef<number | null>(null)

  /**
   * Phase 1: 真实开始监听。
   *
   * URL 带 `?audio=synth` / `?audio=osc:440` 时直接走合成音源（沙箱验收通道），
   * 否则请求真实麦克风。两条路径的下游链路完全一致。
   */
  const startListening = () => {
    setPlaying(true)
    const urlMode = getAudioModeFromLocation()
    void (urlMode ? startDemo(urlMode) : requestMic())
  }

  /** 麦克风不可用时的降级路径（§1.5）：切到演示音源，产品仍可完整走通 */
  const switchToDemo = () => {
    setPlaying(true)
    void startDemo({ kind: "synth" })
  }

  /** Phase 0 mock: 生成练习建议（打字机效果） */
  const generateAdvice = () => {
    setFlowState("streaming")
    appendStreamingText("") // 清空
    let i = 0
    if (adviceTimer.current !== null) {
      window.clearInterval(adviceTimer.current)
    }
    adviceTimer.current = window.setInterval(() => {
      i += 5
      // 用 replace 重置（Phase 0 简化：直接累加到 store）
      // 这里用 appendStreamingText 逐块追加
      const chunk = MOCK_ADVICE_TEXT.slice(i - 5, i)
      appendStreamingText(chunk)
      if (i >= MOCK_ADVICE_TEXT.length) {
        if (adviceTimer.current !== null) {
          window.clearInterval(adviceTimer.current)
          adviceTimer.current = null
        }
        setFlowState("reviewed")
      }
    }, 28)
  }

  // 计算流程步骤状态
  const step1Done = true
  const step2Active = flowState === "idle"
  const step2Done = flowState !== "idle"
  const step3Active =
    flowState === "playing_along" ||
    flowState === "analyzing" ||
    flowState === "streaming" ||
    flowState === "reviewed"

  return (
    <aside className="coach-panel">
      <div className="coach-top">
        <div className="coach-title">
          <div className="coach-orbit">✦</div>
          <div>
            <span className="eyebrow">PRACTICE GUIDE</span>
            <h2>{flowTitle(flowState)}</h2>
          </div>
        </div>
      </div>

      <div className="practice-flow">
        <div className={`flow-step ${step1Done ? "done" : ""}`}>
          <i>1</i>
          <div>
            <b>Song added &amp; score prepared</b>
            <span>Bars 17—28 are ready to practice.</span>
          </div>
        </div>
        <div className={`flow-step ${step2Done ? "done" : step2Active ? "active" : ""}`}>
          <i>2</i>
          <div>
            <b>Play the highlighted passage</b>
            <span>
              {flowState === "idle"
                ? "Start listening when you are ready."
                : "Audio input is being monitored."}
            </span>
          </div>
        </div>
        <div className={`flow-step ${step3Active ? "active" : ""}`}>
          <i>3</i>
          <div>
            <b>Review your playing notes</b>
            <span>
              {flowState === "playing_along"
                ? "Audio detected — notes are ready."
                : "Suggestions unlock after audio is detected."}
            </span>
          </div>
        </div>
      </div>

      {flowState === "idle" && (
        <button className="guide-action" onClick={startListening}>
          START LISTENING
        </button>
      )}

      {flowState === "requesting_mic" && (
        <div className="listening-state">
          <span className="pulse" /> Waiting for microphone permission…
        </div>
      )}

      {flowState === "listening" && (
        <div className="listening-state">
          <span className="pulse" />{" "}
          {synthMode ? "Demo audio running — play along…" : "Listening for your instrument…"}
        </div>
      )}

      {flowState === "playing_along" && (
        <button className="guide-action" onClick={generateAdvice}>
          GENERATE PRACTICE NOTES
        </button>
      )}

      {(flowState === "streaming" || flowState === "reviewed") && (
        <div className="stream-advice">
          {formatAdvice(streamingText)}
          {flowState === "streaming" && <span className="cursor">▍</span>}
        </div>
      )}

      {flowState === "error" && errorType === "mic_error" && (
        <div className="friendly-error">
          <b>Couldn't access your microphone.</b>
          <span>{micError ?? "Allow microphone access in your browser, then try again."}</span>
          <div className="error-actions">
            <button onClick={() => void requestMic()}>TRY AGAIN</button>
            <button className="ghost" onClick={switchToDemo}>
              切换到演示模式
            </button>
          </div>
        </div>
      )}

      {flowState === "error" && errorType === "audio_error" && (
        <div className="friendly-error">
          <b>Couldn't start the audio engine.</b>
          <span>{micError ?? "Your browser blocked audio playback. Try again."}</span>
          <div className="error-actions">
            {/* audio_error 只可能来自演示音源启动失败（startDemo 的 catch），
                因此重试必须直接重启合成音源，绝不能回到 startListening → requestMic
                那条刚刚失败过的麦克风路径（否则会形成 mic → demo → audio_error → mic 死循环）。 */}
            <button onClick={() => void startDemo({ kind: "synth" })}>TRY AGAIN</button>
          </div>
        </div>
      )}

      {flowState === "error" && errorType !== "mic_error" && errorType !== "audio_error" && (
        <div className="friendly-error">
          <b>Couldn't reach the analysis service.</b>
          <span>Check your connection or add an API key, then try again.</span>
          <div className="error-actions">
            <button onClick={() => setFlowState("playing_along")}>TRY AGAIN</button>
          </div>
        </div>
      )}

      <button className="service-link" onClick={() => setFlowState("error")}>
        Having trouble connecting?
      </button>
    </aside>
  )
}
