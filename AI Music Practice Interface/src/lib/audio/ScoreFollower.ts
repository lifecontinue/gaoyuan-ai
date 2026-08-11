/**
 * ScoreFollower — 曲谱跟随（Phase 2 重写，修缺陷 D4）
 *
 * 阶段目标：点 Play 后播放头按真实 BPM 推进、小节高亮自动切换、节拍器出声且与播放头**同源**。
 *
 * ## D4 是什么 / 怎么修
 * 旧实现用 `performance.now()` 计时。它与 `AudioContext.currentTime` 是两个独立时钟：
 *   1. 二者会持续漂移（尤其页面被 throttle 后），节拍器（走 AudioContext 调度）与
 *      播放头（走 performance.now）会越跑越不同步；
 *   2. `performance.now()` 在 node 单测里不可控，时序逻辑无法确定性验证（testability blocker）。
 *
 * 修法：时序权威来源 = **注入的 `Clock`**。
 *   - 生产：`createAudioContextClock(() => ctx.currentTime)`
 *   - 测试：`VirtualClock`
 * 本文件**不得出现** `performance.now()` / `Date.now()` / `setInterval` / `requestAnimationFrame`。
 *
 * ## 设计
 * - `positionAt` 是**纯函数**（无状态、无副作用、不读时钟），可被单测穷举 0..30000ms，
 *   断言单调性、切换点、循环回绕、末尾夹紧。
 * - `ScoreFollower` 只用注入的 Clock 算 `elapsedMs()`，再交给 `positionAt`。
 * - `setBpm` / `setSpeed` 用"先记已过拍数、再回算起点"的**保位**算法：改速后当前小节不跳变。
 * - 不内建任何计时器：高频播放头位移由 React 层 rAF 直接改 DOM transform（§1.4 渲染禁令），
 *   只有"小节切换 / 拍点"这类离散事件才写 store。
 */

import type { AudioFrame, Clock } from "@/lib/audio/types"
import type { Score, Measure, Chord, Section } from "@/lib/music/types"
import { flattenMeasures, findSectionByMeasure } from "@/lib/music/types"
import type { TimingJudgement } from "@/lib/practice/types"
import { classifyOffset, nearestBeatMs, timingOffsetMs } from "@/lib/practice/timing"

/** 曲谱跟随的**离散**状态（低频，可安全写 zustand） */
export interface FollowerState {
  /** 当前小节编号（全局唯一） */
  currentMeasureId: number | null
  /** 当前乐段 id */
  currentSectionId: string | null
  /** 当前拍在小节内的下标（0-based） */
  currentBeatIndex: number
  /** 当前小节的期望和弦 */
  expectedChord: Chord | null
  /** 最近一次 timing 偏差（ms），正数=提前，负数=滞后（§1.2） */
  timingOffsetMs: number
}

/** 循环范围（按小节编号，闭区间） */
export interface LoopRange {
  startId: number
  endId: number
}

/** `positionAt` 的计算结果 */
export interface PositionResult {
  /** 当前小节在 `measures` 中的下标 */
  measureIndex: number
  /** 当前小节编号 */
  measureId: number
  /** 当前拍在小节内的下标（0-based） */
  beatIndex: number
  /** 当前小节进度 0-1 */
  progress: number
  /** 当前拍内已过时间（ms） */
  beatTimeMs: number
}

// ---------------------------------------------------------------------------
// 纯函数区（node 可穷举，无任何时钟/DOM 依赖）
// ---------------------------------------------------------------------------

/**
 * 一拍的毫秒数。
 *
 * 权威锚值（qa-p1 锁定）：bpm=92, speed=100 → 652.17ms；4/4 一小节 = 2608.70ms。
 * speed=50 → 1304.35ms（小节 5217.39ms）；speed=75 → 869.57ms（小节 3478.26ms）。
 */
export function beatDurationMs(bpm: number, speedPercent: number): number {
  const effectiveBpm = (bpm * speedPercent) / 100
  // speedPercent=0 会让时间停滞而非崩溃；bpm>0 由 transportStore 的 clamp 保证
  return effectiveBpm > 0 ? 60000 / effectiveBpm : Number.POSITIVE_INFINITY
}

/** 全曲总时长（ms）。用于 TopBar 的真实进度条与总时长读数。 */
export function totalDurationMs(
  measures: Measure[],
  bpm: number,
  speedPercent: number,
): number {
  const beatDurMs = beatDurationMs(bpm, speedPercent)
  if (!Number.isFinite(beatDurMs)) return Number.POSITIVE_INFINITY
  let total = 0
  for (const m of measures) total += m.beats * beatDurMs
  return total
}

/** 毫秒 → `mm:ss`（负数与非有限值一律回落到 `00:00`，UI 不允许出现 NaN） */
export function formatClock(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "00:00"
  const totalSec = Math.floor(ms / 1000)
  const mm = Math.floor(totalSec / 60)
  const ss = totalSec % 60
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
}

/**
 * 已播比例（0..1），供进度条 `scaleX()` 直接使用。
 *
 * 单独抽出来是因为它是 UI 里最容易出脏值的一处：`totalMs` 在曲谱尚未加载时是 0，
 * `elapsedMs` 在改速的那一帧可能瞬时超过 `totalMs`。任何一处漏夹紧，
 * 进度条就会变成 `scaleX(NaN)` / `scaleX(37)` —— 前者整条消失，后者糊满整个顶栏。
 */
export function progressRatio(elapsedMs: number, totalMs: number): number {
  if (!Number.isFinite(elapsedMs) || !Number.isFinite(totalMs) || totalMs <= 0) return 0
  if (elapsedMs <= 0) return 0
  return Math.min(1, elapsedMs / totalMs)
}

/** 末小节夹紧结果（无循环播到尾、或非法循环范围时复用） */
function clampToEnd(measures: Measure[], beatDurMs: number): PositionResult {
  const last = measures.length - 1
  return {
    measureIndex: last,
    measureId: measures[last].id,
    beatIndex: Math.max(0, measures[last].beats - 1),
    progress: 1,
    beatTimeMs: Number.isFinite(beatDurMs) ? beatDurMs : 0,
  }
}

/**
 * 在 `[0, totalDur)` 内定位 `elapsedMs` 落在哪个小节。
 *
 * 边界语义（**权威锚值依赖此处**）：`remaining === dur` 归**下一小节**。
 * bpm=92 / 4-4 下小节时长 2608.6957ms，于是
 *   `elapsedMs = 2608` → measureId 17（第 0 小节）
 *   `elapsedMs = 2609` → measureId 18（第 1 小节）
 * 切换点误差 < 1ms。
 */
function locate(
  measures: Measure[],
  measureDurations: number[],
  beatDurMs: number,
  elapsedMs: number,
): PositionResult {
  let remaining = Math.max(0, elapsedMs)
  const lastIndex = measures.length - 1
  for (let i = 0; i < measures.length; i += 1) {
    const dur = measureDurations[i]
    if (remaining < dur || i === lastIndex) {
      const beats = measures[i].beats
      const progress = dur > 0 && Number.isFinite(dur) ? Math.min(1, Math.max(0, remaining / dur)) : 0
      const rawBeat = Number.isFinite(beatDurMs) && beatDurMs > 0 ? Math.floor(remaining / beatDurMs) : 0
      const beatIndex = Math.min(beats - 1, Math.max(0, rawBeat))
      const beatTimeMs = Number.isFinite(beatDurMs) ? remaining - beatIndex * beatDurMs : 0
      return { measureIndex: i, measureId: measures[i].id, beatIndex, progress, beatTimeMs }
    }
    remaining -= dur
  }
  // measures 非空时上面的循环必定返回；这里只是让类型收敛
  return clampToEnd(measures, beatDurMs)
}

/**
 * **纯函数**：给定已播放总时长 `elapsedMs`，算出曲谱上的当前位置。
 *
 * 无状态、无副作用、不读任何时钟 —— 可在 node 里穷举 0..30000ms。
 *
 * @param measures     展平后的小节数组（顺序即播放顺序）
 * @param bpm          原曲 BPM
 * @param speedPercent SLOW PRACTICE 百分比（50 / 75 / 100）
 * @param loopRange    循环范围（null = 无循环，播到末尾**停住**且 progress = 1）
 * @param elapsedMs    已播放毫秒数（来自注入的 Clock，绝非 performance.now）
 */
export function positionAt(
  measures: Measure[],
  bpm: number,
  speedPercent: number,
  loopRange: LoopRange | null,
  elapsedMs: number,
): PositionResult {
  if (measures.length === 0) {
    return { measureIndex: 0, measureId: 0, beatIndex: 0, progress: 0, beatTimeMs: 0 }
  }

  const beatDurMs = beatDurationMs(bpm, speedPercent)
  const measureDurations = measures.map((m) => m.beats * beatDurMs)
  const totalDur = measureDurations.reduce((sum, d) => sum + d, 0)

  // 循环端点解析；找不到 / 反序 → 退化为无循环（绝不抛，绝不越界）
  let startIdx = -1
  let endIdx = -1
  if (loopRange) {
    startIdx = measures.findIndex((m) => m.id === loopRange.startId)
    endIdx = measures.findIndex((m) => m.id === loopRange.endId)
  }
  const loopValid = startIdx >= 0 && endIdx >= 0 && endIdx >= startIdx

  if (!loopValid) {
    // 无循环：超过全曲总时长 → 停在最后一小节，progress = 1
    if (elapsedMs >= totalDur) return clampToEnd(measures, beatDurMs)
    return locate(measures, measureDurations, beatDurMs, elapsedMs)
  }

  let preLoopDur = 0
  for (let i = 0; i < startIdx; i += 1) preLoopDur += measureDurations[i]
  let loopDur = 0
  for (let i = startIdx; i <= endIdx; i += 1) loopDur += measureDurations[i]

  let t = elapsedMs
  if (elapsedMs >= preLoopDur && loopDur > 0 && Number.isFinite(loopDur)) {
    // 进入循环区之后，对循环时长取模回绕
    t = preLoopDur + ((elapsedMs - preLoopDur) % loopDur)
  }
  return locate(measures, measureDurations, beatDurMs, t)
}

// ---------------------------------------------------------------------------
// ScoreFollower
// ---------------------------------------------------------------------------

/**
 * 曲谱跟随器。
 *
 * 时序全部来自注入的 `Clock`，自身不持有任何计时器 —— rAF 由上层（usePracticeSession）驱动。
 */
export class ScoreFollower {
  private readonly sections: Section[]
  private readonly measures: Measure[]
  private readonly clock: Clock

  private bpm: number
  private speedPercent: number
  private loopRange: LoopRange | null

  /** 音乐时间 0 对应的 Clock 秒数（null = 从未启动过） */
  private startCtxSec: number | null = null
  /** 累计已暂停秒数 */
  private pausedAccumSec = 0
  /** 进入暂停的 Clock 秒数（null = 未处于暂停） */
  private pauseStartedSec: number | null = null
  private running = false

  // --- Phase 3：timing 判定状态 ---
  /** 上一帧所在的小节编号（用于检出小节边界 → 结算 miss） */
  private lastMeasureId: number | null = null
  /**
   * 每个小节已被计数的 onset 数。
   *
   * 为什么按 measureId 记而不是"当前小节一个计数器"：判定归属的是**期望拍点**所在的小节，
   * 一个抢在小节线前 30ms 的 PERFECT 属于下一小节。若用单计数器，
   * 这个 onset 会被记到上一小节头上，导致下一小节被误判 miss。
   */
  private readonly onsetCountByMeasure = new Map<number, number>()
  /** 最近一次有效判定（供 getState 暴露给 UI） */
  private lastJudgement: TimingJudgement | null = null

  constructor(score: Score, clock: Clock) {
    this.sections = score.sections
    this.measures = flattenMeasures(score.sections)
    this.clock = clock
    this.bpm = score.bpm
    this.speedPercent = 100
    this.loopRange = null
  }

  /** 展平后的小节（供 UI / 节拍器查 beats） */
  get measuresList(): Measure[] {
    return this.measures
  }

  /** 当前有效 BPM（已含 SLOW PRACTICE 变速） */
  get effectiveBpm(): number {
    return (this.bpm * this.speedPercent) / 100
  }

  /** 一拍毫秒数 */
  get beatDurMs(): number {
    return beatDurationMs(this.bpm, this.speedPercent)
  }

  /** 全曲总时长（ms，按当前 bpm/speed 折算） */
  get totalMs(): number {
    return totalDurationMs(this.measures, this.bpm, this.speedPercent)
  }

  /** 是否正在推进 */
  get isRunning(): boolean {
    return this.running
  }

  /** 当前循环范围（只读快照） */
  get currentLoop(): LoopRange | null {
    return this.loopRange ? { ...this.loopRange } : null
  }

  /** 当前 BPM（未含变速；节拍器排期要用它，避免与 store 出现一帧的漂移） */
  get currentBpm(): number {
    return this.bpm
  }

  /** 当前 SLOW PRACTICE 百分比 */
  get currentSpeedPercent(): number {
    return this.speedPercent
  }

  /**
   * 注入时钟的当前秒数。
   *
   * 节拍器需要把"音乐时间上的第 n 拍"换算成 `AudioContext` 的绝对时刻，
   * 而换算基准必须与 `elapsedMs()` **同源**，否则又会退化成 D4 那种双时钟漂移。
   */
  get clockSec(): number {
    return this.clock.nowSec()
  }

  /**
   * 计算 `elapsedMs` / 回算起点时使用的时间锚点。
   *
   * 运行中 = 当前时钟；已暂停 = 暂停发生的时刻（这样 elapsedMs 冻结、
   * 且暂停期间调 setBpm 也不会把位置甩掉）。
   */
  private anchorSec(): number {
    if (this.running) return this.clock.nowSec()
    return this.pauseStartedSec ?? this.clock.nowSec()
  }

  /** 启动 / 从暂停恢复 */
  start(): void {
    if (this.running) return
    if (this.startCtxSec === null) {
      this.startCtxSec = this.clock.nowSec()
      this.pausedAccumSec = 0
      this.pauseStartedSec = null
    } else if (this.pauseStartedSec !== null) {
      // 把这段暂停时长计入累计，音乐时间因此保持连续
      this.pausedAccumSec += this.clock.nowSec() - this.pauseStartedSec
      this.pauseStartedSec = null
    }
    this.running = true
  }

  /** 暂停（冻结 elapsedMs） */
  pause(): void {
    if (!this.running) return
    this.pauseStartedSec = this.clock.nowSec()
    this.running = false
  }

  /** 恢复播放 */
  resume(): void {
    this.start()
  }

  /** 停止并复位到曲首 */
  stop(): void {
    this.running = false
    this.startCtxSec = null
    this.pausedAccumSec = 0
    this.pauseStartedSec = null
    this.resetJudgement()
  }

  /** 清空 Phase 3 的 timing 判定状态（新会话 / 跳转时调用） */
  resetJudgement(): void {
    this.lastMeasureId = null
    this.onsetCountByMeasure.clear()
    this.lastJudgement = null
  }

  /**
   * 当前已播放毫秒数。
   *
   * D4 核心公式：`(clock.nowSec() - startCtxSec - pausedAccumSec) * 1000`。
   * 未启动返回 0；暂停时用 `pauseStartedSec` 冻结。
   */
  elapsedMs(): number {
    if (this.startCtxSec === null) return 0
    return Math.max(0, (this.anchorSec() - this.startCtxSec - this.pausedAccumSec) * 1000)
  }

  /**
   * 把起点回算到"当前音乐位置 = beatsElapsed 拍"的状态。
   *
   * 这是保位变速的唯一实现点。变异守卫：若这里改成朴素的
   * `this.startCtxSec = this.clock.nowSec()`（丢弃 beatsElapsed 记忆），
   * 改速后 measureId 会立刻跳回曲首 —— `ScoreFollower.test.ts` 的 DoD #6 用例必须变红。
   */
  private rebaseToBeats(beatsElapsed: number): void {
    const anchor = this.anchorSec()
    const newBeatDurMs = this.beatDurMs
    this.startCtxSec = anchor - (beatsElapsed * newBeatDurMs) / 1000 - this.pausedAccumSec
    if (!this.running && this.pauseStartedSec === null) {
      // 未启动/已停止状态下改速：把锚点固化，避免 elapsedMs 随时钟漂走
      this.pauseStartedSec = anchor
    }
  }

  /** 改 BPM（保位：当前小节与小节内进度不跳变） */
  setBpm(newBpm: number): void {
    if (!(newBpm > 0)) return
    if (this.startCtxSec === null) {
      this.bpm = newBpm
      return
    }
    const beatsElapsed = this.elapsedMs() / this.beatDurMs
    this.bpm = newBpm
    this.rebaseToBeats(beatsElapsed)
  }

  /** 改 SLOW PRACTICE 速度（同样保位） */
  setSpeed(percent: number): void {
    if (!(percent > 0)) return
    if (this.startCtxSec === null) {
      this.speedPercent = percent
      return
    }
    const beatsElapsed = this.elapsedMs() / this.beatDurMs
    this.speedPercent = percent
    this.rebaseToBeats(beatsElapsed)
  }

  /** 设置循环范围（按小节编号；自动纠正反序输入） */
  setLoopRange(startId: number, endId: number): void {
    this.loopRange = startId <= endId ? { startId, endId } : { startId: endId, endId: startId }
  }

  /** 清除循环 */
  clearLoop(): void {
    this.loopRange = null
  }

  /** 跳转到指定小节的开头；不存在的小节编号是空操作 */
  seekToMeasure(id: number): void {
    const idx = this.measures.findIndex((m) => m.id === id)
    if (idx < 0) return
    const beatDurMs = this.beatDurMs
    let targetMs = 0
    for (let i = 0; i < idx; i += 1) targetMs += this.measures[i].beats * beatDurMs
    const anchor = this.anchorSec()
    this.startCtxSec = anchor - this.pausedAccumSec - targetMs / 1000
    if (!this.running && this.pauseStartedSec === null) this.pauseStartedSec = anchor
  }

  /** 当前位置（高频消费：播放头 / 节拍器；**不要**写 store） */
  getPosition(): PositionResult {
    return positionAt(this.measures, this.bpm, this.speedPercent, this.loopRange, this.elapsedMs())
  }

  /** 当前离散状态（低频消费：小节高亮 / 期望和弦，可写 store） */
  getState(): FollowerState {
    const pos = this.getPosition()
    const section = findSectionByMeasure(this.sections, pos.measureId)
    return {
      currentMeasureId: pos.measureId,
      currentSectionId: section?.id ?? null,
      currentBeatIndex: pos.beatIndex,
      expectedChord: this.measures[pos.measureIndex]?.chord ?? null,
      timingOffsetMs: this.lastJudgement?.offsetMs ?? 0,
    }
  }

  // -------------------------------------------------------------------------
  // Phase 3：实时判定
  // -------------------------------------------------------------------------

  /**
   * 喂入一帧分析结果，产出该帧引发的 timing 判定。
   *
   * 返回数组而不是单个值，是因为**一帧最多可能同时产出两条**：
   *   1. 跨小节的那一帧要先给"刚结束的小节"补一条 miss（如果它一个 onset 都没有）；
   *   2. 本帧自身若是 onset，再给出它的 perfect/good/early/late。
   * 用数组把两者显式表达出来，避免调用方漏掉 miss（这是最容易漏的一条链路）。
   *
   * ⚠️ 两个时间戳各司其职，不能混用：
   *   - 小节定位用 `frame.musicTimeMs`（已扣 ANALYSIS_LATENCY_MS）而非 `timeSec*1000`，
   *     否则每一次演奏都会被系统性判为"滞后 43ms"；
   *   - onset 判定用 `frame.onsetTimeMs`（在前者基础上再补掉峰值拾取的一个 hop 前瞻），
   *     否则再多背一个 21.33ms 的滞后偏置。
   *
   * @param frame 一帧分析结果（来自 AnalysisPipeline）
   */
  ingestFrame(frame: AudioFrame): TimingJudgement[] {
    if (this.measures.length === 0) return []

    const out: TimingJudgement[] = []
    const nowMs = frame.musicTimeMs
    const pos = positionAt(this.measures, this.bpm, this.speedPercent, this.loopRange, nowMs)

    // ---- ① 小节边界：结算刚结束的小节（零 onset → miss）----
    if (this.lastMeasureId !== null && pos.measureId !== this.lastMeasureId) {
      const miss = this.closeMeasure(this.lastMeasureId)
      if (miss) out.push(miss)
    }
    this.lastMeasureId = pos.measureId

    // ---- ② 本帧 onset 的 timing 判定 ----
    // 用 `frame.onsetTimeMs` 而不是 `nowMs`：峰值拾取让 onset 的结论比峰本身晚一个 hop，
    // `onsetTimeMs` 是补偿后的峰值帧时刻。这里若图省事写 `nowMs`，
    // 全体判定会多背一个 21.33ms 的滞后偏置（DoD #9 的误差预算只有 25ms）。
    if (frame.onset) {
      const judgement = this.judgeOnset(frame.onsetTimeMs)
      if (judgement) {
        const prev = this.onsetCountByMeasure.get(judgement.measureId) ?? 0
        this.onsetCountByMeasure.set(judgement.measureId, prev + 1)
        this.lastJudgement = judgement
        out.push(judgement)
      }
    }

    return out
  }

  /**
   * 结束整段会话：冲刷最后一个小节的 miss。
   *
   * 不调用它，末小节的"完全没弹"就会被静默吞掉，
   * `missed` 统计因此偏乐观 —— 这是最容易漏的一条链路，所以单独暴露成公开方法。
   */
  finalize(): TimingJudgement[] {
    const miss = this.lastMeasureId === null ? null : this.closeMeasure(this.lastMeasureId)
    this.lastMeasureId = null
    return miss ? [miss] : []
  }

  /** 小节起始的音乐时刻（ms，按当前 bpm/speed 折算；不含循环回绕） */
  private measureStartMs(measureIndex: number): number {
    const beatDurMs = this.beatDurMs
    if (!Number.isFinite(beatDurMs)) return 0
    let start = 0
    for (let i = 0; i < measureIndex; i += 1) start += this.measures[i].beats * beatDurMs
    return start
  }

  /**
   * 结算指定小节：零有效 onset → 产出一条 miss。
   *
   * 本项目每个小节都带和弦（恒有期望音）；若将来引入休止小节，
   * 在这里加 `measure.beats === 0 || measure.rest` 的短路即可。
   */
  private closeMeasure(measureId: number): TimingJudgement | null {
    if ((this.onsetCountByMeasure.get(measureId) ?? 0) > 0) return null
    const idx = this.measures.findIndex((m) => m.id === measureId)
    if (idx < 0) return null
    const startMs = this.measureStartMs(idx)
    const miss: TimingJudgement = {
      kind: "miss",
      offsetMs: 0,
      measureId,
      onsetTimeMs: startMs,
      expectedMs: startMs,
      beatIndex: 0,
    }
    this.lastJudgement = miss
    return miss
  }

  /** 把一个 onset 对齐到最近拍点并归类；超窗（噪声）返回 null */
  private judgeOnset(onsetTimeMs: number): TimingJudgement | null {
    const beatDurMs = this.beatDurMs
    const expectedMs = nearestBeatMs(onsetTimeMs, beatDurMs)
    const offsetMs = timingOffsetMs(expectedMs, onsetTimeMs)
    const kind = classifyOffset(offsetMs)
    if (kind === null) return null

    // 判定归属到**期望拍点**所在的小节（而不是 onset 落点所在的小节），
    // 否则一个抢在小节线前 30ms 的 PERFECT 会被算进上一小节。
    const at = positionAt(this.measures, this.bpm, this.speedPercent, this.loopRange, expectedMs)
    return {
      kind,
      offsetMs,
      measureId: at.measureId,
      onsetTimeMs,
      expectedMs,
      beatIndex: at.beatIndex,
    }
  }
}
