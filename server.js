import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { loadEnv } from './server/env.mjs'
import {
  steamApi,
  neteaseApi,
  bilibiliApi,
  bangumiApi,
  anilistApi,
  statsApi,
  commentsApi,
} from './server/api.mjs'
import { isConfigured } from './server/steam.mjs'
import { isNeteaseConfigured } from './server/netease.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

loadEnv(__dirname)

const app = express()
const PORT = process.env.PORT || 3000

// Steam Web API proxy (keeps STEAM_API_KEY server-side)
app.use(steamApi())
app.use(neteaseApi())
app.use(bilibiliApi())
app.use(bangumiApi())
app.use(anilistApi())

// Public visit counter (persists to data/stats.json)
app.use(statsApi())

// Visitor comments (persists to data/comments.json)
app.use(commentsApi())

// Gzip 压缩
app.use(express.static(path.join(__dirname, 'dist'), {
  maxAge: '7d',
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache')
    }
  }
}))

// SPA 回退
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, () => {
  console.log(`NAGI BLOG running at http://localhost:${PORT}`)
  if (!isConfigured()) {
    console.warn('[steam-api] STEAM_API_KEY missing — the Steam card stays hidden.')
  }
  if (!isNeteaseConfigured()) {
    console.warn('[netease-api] NETEASE_COOKIE missing — search/play still works but quality may be lower.')
  }
})
