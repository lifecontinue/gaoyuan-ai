import { useEffect, useMemo, useRef, useState, startTransition } from "react";
import { fetchHealth, replySession, startSession } from "./api";
import {
  MODE_META,
  type Intensity,
  type InterviewMode,
  type SessionPublic,
} from "./types";

type UiPhase = "setup" | "room" | "report";
const MODES = Object.keys(MODE_META) as InterviewMode[];

function kindLabel(kind?: string) {
  switch (kind) {
    case "opening":
      return "开场";
    case "probe":
      return "追问";
    case "pushback":
      return "反驳";
    case "interrupt":
      return "打断";
    case "wrap":
      return "收束";
    default:
      return "提问";
  }
}

export default function App() {
  const [uiPhase, setUiPhase] = useState<UiPhase>("setup");
  const [engine, setEngine] = useState<"llm" | "mock">("mock");
  const [mode, setMode] = useState<InterviewMode>("ai_feature_scope");
  const [intensity, setIntensity] = useState<Intensity>("standard");
  const [candidateName, setCandidateName] = useState("");
  const [jdText, setJdText] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [session, setSession] = useState<SessionPublic | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchHealth()
      .then((h) => setEngine(h.engine))
      .catch(() => setEngine("mock"));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.messages.length, uiPhase]);

  const modeMeta = MODE_META[mode];
  const progress = useMemo(() => {
    if (!session) return 0;
    return Math.min(100, Math.round((session.round / session.maxRounds) * 100));
  }, [session]);

  async function onStart() {
    setBusy(true);
    setError("");
    try {
      const { session: next } = await startSession({
        mode,
        intensity,
        candidateName,
        jdText,
        resumeText,
        maxRounds: intensity === "pressure" ? 7 : 6,
      });
      startTransition(() => {
        setSession(next);
        setUiPhase("room");
        setAnswer("");
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onReply() {
    if (!session || !answer.trim()) return;
    setBusy(true);
    setError("");
    try {
      const { session: next } = await replySession(session.id, answer.trim());
      startTransition(() => {
        setSession(next);
        setAnswer("");
        if (next.phase === "scored") setUiPhase("report");
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setSession(null);
    setUiPhase("setup");
    setAnswer("");
    setError("");
  }

  return (
    <div className="app-shell">
      <header className="brand-row">
        <h1 className="brand">
          Brief<span>·面场</span>
        </h1>
        <div className="brand-meta">
          LangGraph 真实面试 Agent · {engine === "llm" ? "LLM 引擎" : "本地演示引擎"}
        </div>
      </header>

      {uiPhase === "setup" && (
        <>
          <section className="hero">
            <div className="hero-copy">
              <div className="tag">AI / PM Interview Arena</div>
              <h2>把面试官请到真实场景里，而不是题库里。</h2>
              <p>
                针对 AI 与产品岗：产品判断、指标权衡、冲突谈判、Agent 定界与复盘。
                LangGraph 编排追问、打断与评分，练的是临场，不是背稿。
              </p>
            </div>
            <aside className="hero-visual" aria-hidden="true">
              <small>Now in session</small>
              <strong>{modeMeta.defaultTitle}</strong>
              <p style={{ margin: 0, opacity: 0.8 }}>
                面试官不会先夸你。答得虚，就会被打断。
              </p>
            </aside>
          </section>

          <section className="setup">
            <div className="mode-grid">
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`mode-btn ${mode === m ? "active" : ""}`}
                  onClick={() => setMode(m)}
                >
                  <b>{MODE_META[m].label}</b>
                  <span>{MODE_META[m].blurb}</span>
                </button>
              ))}
            </div>

            <div className="row">
              <span className="muted">强度</span>
              {(["warm", "standard", "pressure"] as Intensity[]).map((i) => (
                <button
                  key={i}
                  type="button"
                  className={`chip ${intensity === i ? "active" : ""}`}
                  onClick={() => setIntensity(i)}
                >
                  {i === "warm" ? "暖场" : i === "standard" ? "标准" : "高压"}
                </button>
              ))}
            </div>

            <div className="field-grid">
              <label>
                你的名字（可选）
                <input
                  value={candidateName}
                  onChange={(e) => setCandidateName(e.target.value)}
                  placeholder="例如：高远"
                />
              </label>
              <label>
                目标岗位 JD（可选）
                <input
                  value={jdText}
                  onChange={(e) => setJdText(e.target.value)}
                  placeholder="粘贴关键职责 / 能力要求"
                />
              </label>
              <label className="full">
                简历摘要（可选）
                <textarea
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                  placeholder="用几句话写你的 AI/产品经历、代表项目与结果"
                />
              </label>
            </div>

            <div className="row">
              <button type="button" className="primary" disabled={busy} onClick={onStart}>
                {busy ? "场景生成中…" : "进入面场"}
              </button>
              {error && <span className="error">{error}</span>}
            </div>
          </section>
        </>
      )}

      {uiPhase === "room" && session && (
        <section className="room">
          <aside className="brief-panel">
            <div className="tag">{session.scenario.company}</div>
            <h3>{session.scenario.title}</h3>
            <p>{session.scenario.setting}</p>
            <p>
              <b>{session.scenario.interviewerName}</b>
              <br />
              {session.scenario.interviewerTitle}
            </p>
            <p>风险点：{session.scenario.stakes}</p>
            <div>
              <div className="muted">
                进度 {session.round}/{session.maxRounds}
              </div>
              <div className="bar">
                <i style={{ width: `${progress}%` }} />
              </div>
            </div>
            <button type="button" className="ghost" onClick={reset}>
              结束并返回
            </button>
          </aside>

          <div className="chat-panel">
            <div className="chat-head">
              <div>
                <strong>面试进行中</strong>
                <div className="muted">{session.scenario.style}</div>
              </div>
              <div className="tag">{session.intensity}</div>
            </div>
            <div className="messages">
              {session.messages.map((m) => (
                <div key={m.id} className={`bubble ${m.role}`}>
                  {m.role === "interviewer" && (
                    <span className="kind">{kindLabel(m.kind)}</span>
                  )}
                  {m.content}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <div className="composer">
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="像真实面试一样回答。短句、取舍、证据。"
                disabled={busy || !session.awaitingAnswer}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void onReply();
                  }
                }}
              />
              <div className="row">
                <button
                  type="button"
                  className="primary"
                  disabled={busy || !answer.trim() || !session.awaitingAnswer}
                  onClick={onReply}
                >
                  {busy ? "面试官思考中…" : "发送回答 ⌘↵"}
                </button>
                {error && <span className="error">{error}</span>}
              </div>
            </div>
          </div>
        </section>
      )}

      {uiPhase === "report" && session?.report && (
        <section className="report-shell">
          <div className="score-hero">
            <div>
              <div className="tag">面试复盘</div>
              <div className="big">{session.report.overall}</div>
              <p className="muted">{session.report.summary}</p>
            </div>
            <div className="row">
              <button type="button" className="primary" onClick={reset}>
                再来一局
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => setUiPhase("room")}
              >
                回看对话
              </button>
            </div>
          </div>

          <div className="dims">
            {session.report.dimensions.map((d) => (
              <div key={d.id} className="dim">
                <div className="dim-top">
                  <strong>
                    {d.label} · {d.score}
                  </strong>
                  <span className="muted">{d.tip}</span>
                </div>
                <div className="bar">
                  <i style={{ width: `${d.score}%` }} />
                </div>
                <p className="muted">{d.evidence}</p>
              </div>
            ))}
          </div>

          <div className="split-list">
            <div>
              <strong>亮点</strong>
              <ul>
                {(session.report.highlights.length
                  ? session.report.highlights
                  : ["本场亮点不够突出，下次主动抛证据。"]
                ).map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
            <div>
              <strong>风险</strong>
              <ul>
                {(session.report.risks.length
                  ? session.report.risks
                  : ["暂无高风险项，继续保持取舍清晰。"]
                ).map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
          </div>

          <div>
            <strong>下一组训练</strong>
            <ul>
              {session.report.nextDrills.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
