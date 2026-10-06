#!/usr/bin/env node
/**
 * sync-comments.mjs — Scan a directory of .md comment files and generate comments.ts
 *
 * Usage:
 *   node scripts/sync-comments.mjs [md-dir] [output-file]
 *
 * Defaults: md-dir = ./comments, output = ./src/data/comments.ts
 *
 * Each .md file must have YAML frontmatter with "author", body is the comment text.
 * ---
 * author: 张三
 * ---
 * 评论内容文字。
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'

const MD_DIR = resolve(process.argv[2] || './comments')
const OUT_FILE = resolve(process.argv[3] || './src/data/comments.ts')

function parseComment(raw) {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/)
  if (!match) return { author: 'Anonymous', text: raw.trim() }

  const yamlBlock = match[1]
  let text = match[2].trim()
  let author = 'Anonymous'

  for (const line of yamlBlock.split('\n')) {
    const eq = line.indexOf(':')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
      val = val.slice(1, -1)
    }
    if (key === 'author') author = val
  }

  return { author, text }
}

function escapeTpl(str) {
  return str.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\${/g, '\\${')
}

function main() {
  if (!existsSync(MD_DIR)) {
    console.error(`Directory not found: ${MD_DIR}`)
    console.error(`Create it: mkdir -p ${MD_DIR}`)
    process.exit(1)
  }

  const files = readdirSync(MD_DIR)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .sort()

  if (files.length === 0) {
    console.error(`No .md files found in ${MD_DIR}`)
    process.exit(1)
  }

  console.log(`Scanning ${files.length} comment file(s) from ${MD_DIR} ...`)

  const comments = []

  for (const file of files) {
    const raw = readFileSync(join(MD_DIR, file), 'utf-8')
    const { author, text } = parseComment(raw)
    if (!text) {
      console.warn(`  \u26a0  ${file}: empty body, skipping`)
      continue
    }
    comments.push({ author, text })
  }

  const lines = [
    `export type Comment = { author: string; text: string }`,
    ``,
    `export const COMMENTS: Comment[] = [`,
  ]

  for (const c of comments) {
    lines.push(`  { author: '${escapeTpl(c.author)}', text: \`${escapeTpl(c.text)}\` },`)
  }

  lines.push(`]\n`)

  const outDir = resolve(OUT_FILE, '..')
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true })
  }

  writeFileSync(OUT_FILE, lines.join('\n'), 'utf-8')
  console.log(`\nWrote ${comments.length} comment(s) to ${OUT_FILE}`)
}

main()
