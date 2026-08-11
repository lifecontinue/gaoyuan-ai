/**
 * PitchMonitor — 实时拾音 HUD
 *
 * 显示：音名 + 八度 / 频率 Hz / 音分指针 / 输入电平条 / DEMO AUDIO 标签。
 *
 * 纯展示组件：数据只来自 `useAudioFrame`（AudioBus，20Hz 节流）与 `audioStore`，
 * **不 new 任何引擎类**（§1.1 分层规则）。
 */

import {
  CENTS_METER_RANGE,
  INPUT_LEVEL_MAX_DBFS,
  INPUT_LEVEL_MIN_DBFS,
} from "@/lib/audio/constants"
import { dbfsToLevelRatio } from "@/lib/audio/dsp/rms"
import { describeAudioMode } from "@/lib/audio/audioMode"
import { useAudioFrame } from "@/hooks/useAudioFrame"
import { useAudioStore } from "@/lib/store/audioStore"

/** 音分偏差 → 判定文案与配色类名 */
function centsVerdict(centsOff: number): { label: string; tone: string } {
  const abs = Math.abs(centsOff)
  if (abs <= 5) return { label: "IN TUNE", tone: "good" }
  if (abs <= 20) return { label: centsOff > 0 ? "SLIGHTLY SHARP" : "SLIGHTLY FLAT", tone: "warn" }
  return { label: centsOff > 0 ? "SHARP" : "FLAT", tone: "bad" }
}

export function PitchMonitor() {
  const frame = useAudioFrame()
  const detecting = useAudioStore((s) => s.detecting)
  const synthMode = useAudioStore((s) => s.synthMode)

  // 优先显示稳定后的确认音；只有原始音高时也显示，但标记为未确认
  const confirmed = frame?.confirmedNote ?? null
  const raw = frame?.pitch ?? null
  const hasReading = confirmed !== null || raw !== null

  const noteName = confirmed?.noteName ?? raw?.noteName ?? null
  const octave = confirmed?.octave ?? raw?.octave ?? null
  const frequency = confirmed?.frequency ?? raw?.frequency ?? 0
  const centsOff = confirmed?.centsOff ?? raw?.centsOff ?? 0
  const clarity = confirmed?.clarity ?? raw?.clarity ?? 0

  const levelDb = frame?.levelDb ?? INPUT_LEVEL_MIN_DBFS
  const levelRatio = dbfsToLevelRatio(levelDb, INPUT_LEVEL_MIN_DBFS, INPUT_LEVEL_MAX_DBFS)

  // 指针位置：-50..+50 cents 映射到 0..100%
  const clampedCents = Math.max(-CENTS_METER_RANGE, Math.min(CENTS_METER_RANGE, centsOff))
  const needlePercent = ((clampedCents + CENTS_METER_RANGE) / (CENTS_METER_RANGE * 2)) * 100
  const verdict = centsVerdict(clampedCents)

  const statusText = !detecting
    ? "STANDBY"
    : hasReading
      ? confirmed
        ? "LOCKED"
        : "TRACKING"
      : "SILENT"

  return (
    <div className={`pitch-monitor ${detecting ? "is-live" : ""}`}>
      <div className="pm-head">
        <span className="pm-eyebrow">LIVE INPUT</span>
        <span className={`pm-status pm-status-${statusText.toLowerCase()}`}>{statusText}</span>
        {synthMode && <span className="pm-demo-tag">DEMO AUDIO · {describeAudioMode(synthMode)}</span>}
      </div>

      <div className="pm-body">
        <div className="pm-note">
          {hasReading && noteName !== null ? (
            <>
              <strong>{noteName}</strong>
              <sub>{octave}</sub>
            </>
          ) : (
            <strong className="pm-note-empty">—</strong>
          )}
        </div>

        <div className="pm-readouts">
          <div className="pm-readout">
            <span>FREQ</span>
            <b>{hasReading ? `${frequency.toFixed(1)} Hz` : "— Hz"}</b>
          </div>
          <div className="pm-readout">
            <span>CENTS</span>
            <b className={`pm-cents-${verdict.tone}`}>
              {hasReading ? `${centsOff > 0 ? "+" : ""}${centsOff.toFixed(0)}` : "—"}
            </b>
          </div>
          <div className="pm-readout">
            <span>CLARITY</span>
            <b>{hasReading ? clarity.toFixed(2) : "—"}</b>
          </div>
        </div>
      </div>

      <div className="pm-meter" aria-hidden={!hasReading}>
        <div className="pm-meter-track">
          <i className="pm-meter-center" />
          {hasReading && (
            <i
              className={`pm-meter-needle pm-needle-${verdict.tone}`}
              style={{ left: `${needlePercent}%` }}
            />
          )}
        </div>
        <div className="pm-meter-scale">
          <span>-50</span>
          <span>{hasReading ? verdict.label : "NO SIGNAL"}</span>
          <span>+50</span>
        </div>
      </div>

      <div className="pm-level">
        <span>LEVEL</span>
        <div className="pm-level-track">
          <i style={{ width: `${(levelRatio * 100).toFixed(1)}%` }} />
        </div>
        <b>{Number.isFinite(levelDb) ? `${levelDb.toFixed(0)} dB` : "— dB"}</b>
      </div>
    </div>
  )
}
