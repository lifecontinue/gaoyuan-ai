from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


SAMPLE_TRACES: list[dict[str, Any]] = [
    {
        "agent": "Capture Agent",
        "operation": "infer_capture_suggestions",
        "model": "pm-growth-local-agent",
        "promptTokens": 42,
        "completionTokens": 58,
        "totalTokens": 100,
        "estimatedCostUsd": 0.0000137,
        "latencyMs": 920,
        "status": "success",
    },
    {
        "agent": "Reflection Agent",
        "operation": "generate_weekly_markdown",
        "model": "pm-growth-local-agent",
        "promptTokens": 280,
        "completionTokens": 420,
        "totalTokens": 700,
        "estimatedCostUsd": 0.000098,
        "latencyMs": 5720,
        "status": "success",
    },
]


def main() -> None:
    parser = argparse.ArgumentParser(description="Summarize PM Growth OS model traces.")
    parser.add_argument(
        "trace_file",
        nargs="?",
        help="Path to an exported model trace JSON file. Uses a sample if omitted.",
    )
    args = parser.parse_args()

    traces = load_traces(args.trace_file)
    summary = summarize(traces)

    print("Model Trace Report")
    print("==================")
    print(f"calls: {summary['calls']}")
    print(f"prompt_tokens: {summary['prompt_tokens']}")
    print(f"completion_tokens: {summary['completion_tokens']}")
    print(f"total_tokens: {summary['total_tokens']}")
    print(f"estimated_cost_usd: ${summary['estimated_cost_usd']:.6f}")
    print(f"avg_latency_ms: {summary['avg_latency_ms']:.0f}")
    print()
    print("by_agent:")
    for agent, count in summary["by_agent"].items():
        print(f"- {agent}: {count}")


def load_traces(trace_file: str | None) -> list[dict[str, Any]]:
    if trace_file is None:
        return SAMPLE_TRACES

    path = Path(trace_file)
    with path.open("r", encoding="utf-8") as file:
        traces = json.load(file)

    if not isinstance(traces, list):
        raise ValueError("Trace file must contain a JSON array.")

    return traces


def summarize(traces: list[dict[str, Any]]) -> dict[str, Any]:
    by_agent: dict[str, int] = {}
    total_latency = 0

    for trace in traces:
        agent = str(trace.get("agent", "Unknown"))
        by_agent[agent] = by_agent.get(agent, 0) + 1
        total_latency += int(trace.get("latencyMs", 0))

    calls = len(traces)

    return {
        "calls": calls,
        "prompt_tokens": sum_int(traces, "promptTokens"),
        "completion_tokens": sum_int(traces, "completionTokens"),
        "total_tokens": sum_int(traces, "totalTokens"),
        "estimated_cost_usd": sum_float(traces, "estimatedCostUsd"),
        "avg_latency_ms": total_latency / calls if calls else 0,
        "by_agent": by_agent,
    }


def sum_int(traces: list[dict[str, Any]], key: str) -> int:
    return sum(int(trace.get(key, 0)) for trace in traces)


def sum_float(traces: list[dict[str, Any]], key: str) -> float:
    return sum(float(trace.get(key, 0.0)) for trace in traces)


if __name__ == "__main__":
    main()
