/**
 * Metronome — 节拍器（Phase 2 重写）
 *
 * ## 为什么删掉了原来的 `start()` / 内部 scheduler
 * 旧实现自己跑一条 `window.setTimeout` 的 lookahead 循环，并持有自己的 `bpm`。
 * 那等于**第二套时间源**：一旦 BPM± / SLOW PRACTICE 改速，或页面被 throttle，
 * 节拍器和播放头就会各走各的（这正是缺陷 D4 的同类问题）。
 *
 * Phase 2 的约定：**节拍点由 ScoreFollower 唯一产出**，本类退化为纯粹的
 * "在指定 AudioContext 时刻发一声" 的执行器（`scheduleClick`）。
 * 调度提前量由 usePracticeSession 的 rAF 循环负责。
 *
 * ## 串音（crosstalk）
 * 节拍器接在 `context.destination` 上，外放时会被麦克风重新拾入，污染音高检测。
 * 因此默认 **关闭**（`transportStore.metronomeEnabled = false`），
 * 默认音量 0.25，UI 侧提示"建议佩戴耳机"。
 */

/** 音量安全上限：再往上就容易在外放时压过被检测的乐器 */
const MAX_VOLUME = 1

export interface MetronomeOptions {
  /** 弱拍频率（Hz） */
  clickFrequency?: number
  /** 强拍（每小节第一拍）频率（Hz） */
  accentFrequency?: number
  /** 初始音量 0-1（默认 0.25） */
  volume?: number
  /** 单次 click 的时长（秒，默认 0.05） */
  clickDurationSec?: number
}

export class Metronome {
  private readonly context: AudioContext
  private readonly clickFreq: number
  private readonly accentFreq: number
  private readonly clickDurationSec: number

  /** 总输出增益：setVolume / setMuted 都作用在它上面，避免逐个 osc 调音量 */
  private readonly masterGain: GainNode

  /** 已排期但尚未播完的振荡器；dispose 时必须逐个 stop + disconnect，否则会泄漏 */
  private readonly liveOscillators = new Set<OscillatorNode>()

  private volumeValue: number
  private mutedValue = false
  private disposedValue = false

  constructor(context: AudioContext, options: MetronomeOptions = {}) {
    this.context = context
    this.clickFreq = options.clickFrequency ?? 1000
    this.accentFreq = options.accentFrequency ?? 1500
    this.clickDurationSec = options.clickDurationSec ?? 0.05
    this.volumeValue = clampVolume(options.volume ?? 0.25)

    this.masterGain = context.createGain()
    this.masterGain.gain.value = this.volumeValue
    this.masterGain.connect(context.destination)
  }

  /** 当前音量 0-1 */
  get volume(): number {
    return this.volumeValue
  }

  /** 是否静音 */
  get muted(): boolean {
    return this.mutedValue
  }

  /** 是否已释放 */
  get disposed(): boolean {
    return this.disposedValue
  }

  /** 尚未播完的振荡器数量（诊断用；泄漏时这个数会一直涨） */
  get liveCount(): number {
    return this.liveOscillators.size
  }

  /** 设置音量（0-1，越界自动夹紧）。静音状态下只记录，不解除静音。 */
  setVolume(value: number): void {
    this.volumeValue = clampVolume(value)
    if (this.disposedValue) return
    this.applyGain()
  }

  /** 静音 / 取消静音 */
  setMuted(value: boolean): void {
    this.mutedValue = value
    if (this.disposedValue) return
    this.applyGain()
  }

  /** 切换静音，返回切换后的状态 */
  toggleMuted(): boolean {
    this.setMuted(!this.mutedValue)
    return this.mutedValue
  }

  /**
   * 在指定的 **AudioContext 时刻**排一声 click。
   *
   * @param atCtxSec 目标时刻（`AudioContext.currentTime` 同源；早于当前时刻会被夹到当前时刻）
   * @param accent   是否强拍（小节第一拍）
   */
  scheduleClick(atCtxSec: number, accent: boolean): void {
    if (this.disposedValue) return
    if (!Number.isFinite(atCtxSec)) return

    const time = Math.max(atCtxSec, this.context.currentTime)
    const osc = this.context.createOscillator()
    const gain = this.context.createGain()
    osc.connect(gain)
    gain.connect(this.masterGain)

    osc.frequency.value = accent ? this.accentFreq : this.clickFreq

    // 强拍略响；包络用极短的 attack + 指数衰减，避免 click 本身产生 onset 尾巴
    const peak = accent ? 1 : 0.55
    gain.gain.setValueAtTime(0.0001, time)
    gain.gain.exponentialRampToValueAtTime(peak, time + 0.001)
    gain.gain.exponentialRampToValueAtTime(0.0001, time + this.clickDurationSec)

    osc.onended = () => {
      this.liveOscillators.delete(osc)
      try {
        osc.disconnect()
        gain.disconnect()
      } catch {
        // 节点可能已随 context 关闭被回收，忽略
      }
    }

    osc.start(time)
    osc.stop(time + this.clickDurationSec)
    this.liveOscillators.add(osc)
  }

  /** 立刻停掉所有已排期但未播完的 click（暂停 / 停止 / 改速时调用，防止"幽灵拍"） */
  stopAll(): void {
    for (const osc of this.liveOscillators) {
      try {
        osc.onended = null
        osc.stop()
        osc.disconnect()
      } catch {
        // 已经停过 / context 已关闭，忽略
      }
    }
    this.liveOscillators.clear()
  }

  /** 彻底释放：清空所有振荡器并断开 masterGain */
  dispose(): void {
    if (this.disposedValue) return
    this.stopAll()
    try {
      this.masterGain.disconnect()
    } catch {
      // context 已关闭，忽略
    }
    this.disposedValue = true
  }

  private applyGain(): void {
    const target = this.mutedValue ? 0 : this.volumeValue
    // setTargetAtTime 会拖尾，这里用即时赋值，避免切静音后还能听到半拍
    this.masterGain.gain.value = target
  }
}

/** 音量夹紧到 [0, MAX_VOLUME]；非有限值回落到 0 */
function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(MAX_VOLUME, Math.max(0, value))
}
