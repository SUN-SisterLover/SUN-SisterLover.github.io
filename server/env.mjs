import fs from 'node:fs'
import path from 'node:path'

/**
 * Minimal `.env` loader (no dependency).
 *
 * Reads `.env.local` then `.env` from the project root and copies any missing
 * keys into `process.env`. Real environment variables always win, so hosting
 * platforms (Railway / Fly / Docker `-e`) keep full control.
 *
 * @param {string} [cwd] project root, defaults to `process.cwd()`
 */
export function loadEnv(cwd = process.cwd()) {
  for (const name of ['.env.local', '.env']) {
    const file = path.join(cwd, name)
    let text
    try {
      text = fs.readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq === -1) continue
      const key = line.slice(0, eq).trim().replace(/^export\s+/, '')
      let value = line.slice(eq + 1).trim()
      const quoted =
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      if (quoted && value.length >= 2) value = value.slice(1, -1)
      if (key && process.env[key] === undefined) process.env[key] = value
    }
  }
}
