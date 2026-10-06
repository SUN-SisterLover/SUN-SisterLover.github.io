#!/usr/bin/env node
/**
 * sync-posts.mjs — Scan a directory of .md files and generate post files
 *
 * Usage:
 *   node scripts/sync-posts.mjs [md-dir] [output-dir]
 *
 * Defaults: md-dir = ./posts, output = ./src/data/posts
 *
 * Each .md file must have YAML frontmatter:
 * ---
 * id: my-post                   # kebab-case, used as URL hash
 * index: '07'                   # two-digit ordering number
 * title_zh: 中文标题
 * title_en: English Title
 * excerpt_zh: 中文摘要
 * excerpt_en: English excerpt
 * tags: [TECH, DESIGN]
 * date: '2026.06.15'
 * readTime: 4 min
 * hidden: false                 # optional, set true to hide the post
 * track_<id>: url | title | artist | cover
 *                               # optional, define audio tracks (multiple allowed)
 *   e.g. track_moon: /audio/moon.mp3 | Moonlight | Some Artist | /audio/moon.jpg
 *   Reference a track in the body with a line containing only ^moon^ —
 *   it renders a music card that plays in the floating player.
 * ---
 *
 * Body content. Use `<!-- zh -->` / `<!-- en -->` markers to separate
 * language sections. The first unmarked section is treated as bilingual
 * (used for both zh and en).
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'

const MD_DIR = resolve(process.argv[2] || './posts')
const OUT_DIR = resolve(process.argv[3] || './src/data/posts')

function parseFrontmatter(raw) {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/)
  if (!match) return { meta: {}, body: raw }

  const yamlBlock = match[1]
  const body = match[2].trim()
  const meta = {}

  for (const line of yamlBlock.split('\n')) {
    const eq = line.indexOf(':')
    if (eq === -1) continue
    let key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()

    if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
      val = val.slice(1, -1)
    }

    if (val.startsWith('[') && val.endsWith(']')) {
      val = val.slice(1, -1).split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    }

    if (val === 'true') val = true
    else if (val === 'false') val = false

    meta[key] = val
  }

  return { meta, body }
}

function splitBody(body) {
  const zhMatch = body.match(/<!--\s*zh\s*-->([\s\S]*?)(?:<!--\s*en\s*-->|$)/)
  const enMatch = body.match(/<!--\s*en\s*-->([\s\S]*?)(?:<!--\s*zh\s*-->|$)/)

  if (!zhMatch && !enMatch) {
    return { zh: body, en: body }
  }

  const zh = zhMatch ? zhMatch[1].trim() : ''
  const en = enMatch ? enMatch[1].trim() : ''

  if (!zh) return { zh: en, en }
  if (!en) return { zh, en: zh }
  return { zh, en }
}

function escapeTpl(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\${/g, '\\${')
    .replace(/'/g, "\\'")
}

function main() {
  if (!existsSync(MD_DIR)) {
    console.error(`Directory not found: ${MD_DIR}`)
    process.exit(1)
  }

  const files = readdirSync(MD_DIR)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .sort()

  if (files.length === 0) {
    console.error(`No .md files found in ${MD_DIR}`)
    process.exit(1)
  }

  console.log(`Scanning ${files.length} .md file(s) from ${MD_DIR} ...`)

  // ensure output dir
  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true })
  }

  const posts = []

  for (const file of files) {
    const raw = readFileSync(join(MD_DIR, file), 'utf-8')
    const { meta, body } = parseFrontmatter(raw)

    if (!meta.id) {
      meta.id = file.replace(/\.md$/, '')
      console.warn(`  \u26a0  ${file}: no "id" in frontmatter, using "${meta.id}"`)
    }

    const langs = splitBody(body)
    posts.push({ meta, zh: langs.zh, en: langs.en })
  }

  posts.sort((a, b) => {
    const ia = parseInt(a.meta.index || '99', 10)
    const ib = parseInt(b.meta.index || '99', 10)
    return ia - ib
  })

  // write individual post files + index.ts
  const importLines = []
  const postVarNames = []

  for (let i = 0; i < posts.length; i++) {
    const p = posts[i]
    const m = p.meta
    const safeName = m.id.replace(/[^a-zA-Z0-9_$]/g, '_')
    const varName = `post${String(i + 1).padStart(2, '0')}`
    const tags = Array.isArray(m.tags)
      ? m.tags.map((t) => `'${t}'`).join(', ')
      : `'${m.tags || 'MISC'}'`
    const excerptZh = escapeTpl(m.excerpt_zh || '')
    const excerptEn = escapeTpl(m.excerpt_en || '')
    const bodyZh = escapeTpl(p.zh)
    const bodyEn = escapeTpl(p.en)
    const date = m.date || '2026.06'
    const readTime = m.readTime || '1 min'
    const hidden = m.hidden === true
    const tracks = Object.keys(m)
      .filter((k) => k.startsWith('track_') && typeof m[k] === 'string' && m[k])
      .map((k) => {
        const [url, title, artist, cover] = String(m[k])
          .split('|')
          .map((s) => s.trim())
        return { id: k.slice('track_'.length), url, title, artist, cover }
      })
      .filter((t) => t.id && t.url)
    const audioBlock = tracks.length
      ? [
          `  audio: [`,
          ...tracks.map(
            (t) =>
              `    { id: '${escapeTpl(t.id)}', url: '${escapeTpl(t.url)}'` +
              (t.title ? `, title: '${escapeTpl(t.title)}'` : '') +
              (t.artist ? `, artist: '${escapeTpl(t.artist)}'` : '') +
              (t.cover ? `, cover: '${escapeTpl(t.cover)}'` : '') +
              ` },`,
          ),
          `  ],`,
        ].join('\n')
      : null

    const lines = [
      `import type { PostDef } from './types'`,
      '',
      `const post: PostDef = {`,
      `  id: '${m.id}',`,
      `  index: '${m.index || '99'}',`,
      `  title: { zh: '${escapeTpl(m.title_zh || '')}', en: '${escapeTpl(m.title_en || '')}' },`,
      `  excerpt: {`,
      `    zh: '${excerptZh}',`,
      `    en: '${excerptEn}',`,
      `  },`,
      `  body: {`,
      `    zh: \`${bodyZh}\`,`,
      `    en: \`${bodyEn}\`,`,
      `  },`,
      `  tags: [${tags}],`,
      `  date: '${date}',`,
      `  readTime: '${readTime}',`,
      audioBlock,
      hidden ? `  hidden: true,` : null,
      `}`,
      '',
      `export default post`,
      '',
    ].filter(Boolean).join('\n')

    writeFileSync(join(OUT_DIR, `${m.id}.ts`), lines, 'utf-8')
    console.log(`  wrote ${m.id}.ts${hidden ? ' (hidden)' : ''}`)

    importLines.push(`import ${varName} from './${m.id}'`)
    postVarNames.push(varName)
  }

  // barrel index.ts
  const barrel = [
    `export type { PostDef } from './types'`,
    '',
    ...importLines,
    '',
    `export const POSTS = [`,
    `  ${postVarNames.join(',\n  ')},`,
    `].filter((p) => !p.hidden)`,
    '',
  ].join('\n')

  writeFileSync(join(OUT_DIR, 'index.ts'), barrel, 'utf-8')
  console.log(`\nwrote index.ts (${posts.length} post(s), ${posts.filter((p) => p.meta.hidden).length} hidden)`)
}

main()
