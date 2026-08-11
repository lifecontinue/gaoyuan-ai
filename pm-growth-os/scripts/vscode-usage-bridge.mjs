#!/usr/bin/env node

const endpoint =
  process.env.PM_GROWTH_USAGE_BRIDGE_URL ?? 'http://127.0.0.1:8787/api/usage-logs';
const token = process.env.VSCODE_USAGE_BRIDGE_TOKEN;

try {
  const payload = JSON.parse(await readStdin());
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null);
    throw new Error(errorPayload?.message ?? `Usage Bridge failed with status ${response.status}.`);
  }

  const result = await response.json();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

async function readStdin() {
  const chunks = [];

  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf-8').trim();

  if (!raw) {
    throw new Error('Expected usage metadata JSON on stdin.');
  }

  return raw;
}
