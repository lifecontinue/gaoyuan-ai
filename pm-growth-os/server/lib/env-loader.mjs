import fs from 'node:fs';
import path from 'node:path';

let loaded = false;

export function loadLocalEnv(cwd = process.cwd()) {
  if (loaded) return;
  loaded = true;

  for (const fileName of ['.env.local', '.env']) {
    const filePath = path.join(cwd, fileName);

    if (!fs.existsSync(filePath)) continue;

    const content = fs.readFileSync(filePath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const parsed = parseEnvLine(line);

      if (!parsed || process.env[parsed.key] !== undefined) continue;

      process.env[parsed.key] = parsed.value;
    }
  }
}

function parseEnvLine(line) {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith('#')) return null;

  const separatorIndex = trimmed.indexOf('=');
  if (separatorIndex === -1) return null;

  const key = trimmed.slice(0, separatorIndex).trim();
  const rawValue = trimmed.slice(separatorIndex + 1).trim();

  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;

  return {
    key,
    value: unquoteValue(rawValue),
  };
}

function unquoteValue(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
