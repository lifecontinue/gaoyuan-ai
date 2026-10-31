import type { Intensity, InterviewMode, SessionPublic } from "./types";

async function parseJson<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error || `HTTP_${res.status}`);
  }
  return body as T;
}

export async function fetchHealth() {
  const res = await fetch("/api/health");
  return parseJson<{ ok: boolean; engine: "llm" | "mock" }>(res);
}

export async function startSession(input: {
  mode: InterviewMode;
  intensity: Intensity;
  resumeText: string;
  jdText: string;
  candidateName: string;
  maxRounds: number;
}) {
  const res = await fetch("/api/session/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJson<{ session: SessionPublic }>(res);
}

export async function replySession(id: string, answer: string) {
  const res = await fetch(`/api/session/${id}/reply`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ answer }),
  });
  return parseJson<{ session: SessionPublic }>(res);
}
