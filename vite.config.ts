import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
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

/**
 * Mount the Steam Web API proxy on the dev server so `npm run dev` behaves
 * exactly like production (`npm start`), without leaking STEAM_API_KEY to the
 * browser bundle.
 */
function steamApiPlugin(): Plugin {
  return {
    name: 'steam-api-dev',
    apply: 'serve',
    configureServer(server) {
      loadEnv()
      server.middlewares.use(steamApi())
    },
  }
}

/**
 * Mount the NetEase Cloud Music API proxy on the dev server so `npm run dev`
 * behaves exactly like production (`npm start`).
 */
function neteaseApiPlugin(): Plugin {
  return {
    name: 'netease-api-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(neteaseApi())
    },
  }
}

/**
 * Mount the Bilibili proxy on the dev server so `npm run dev` behaves
 * exactly like production (`npm start`).
 */
function bilibiliApiPlugin(): Plugin {
  return {
    name: 'bilibili-api-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(bilibiliApi())
    },
  }
}

/**
 * Mount the Bangumi proxy on the dev server so `npm run dev` behaves
 * exactly like production (`npm start`).
 */
function bangumiApiPlugin(): Plugin {
  return {
    name: 'bangumi-api-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(bangumiApi())
    },
  }
}

/**
 * Mount the AniList proxy on the dev server so `npm run dev` behaves
 * exactly like production (`npm start`).
 */
function anilistApiPlugin(): Plugin {
  return {
    name: 'anilist-api-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(anilistApi())
    },
  }
}

/**
 * Mount the public visit counter on the dev server so `npm run dev` behaves
 * exactly like production (`npm start`).
 */
function statsApiPlugin(): Plugin {
  return {
    name: 'stats-api-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(statsApi())
    },
  }
}

/**
 * Mount visitor comments on the dev server so `npm run dev` behaves exactly like
 * production (`npm start`).
 */
function commentsApiPlugin(): Plugin {
  return {
    name: 'comments-api-dev',
    apply: 'serve',
    configureServer(server) {
      loadEnv()
      server.middlewares.use(commentsApi())
    },
  }
}

export default defineConfig({
  base: process.env.PAGES_BASE_URL || '/',
  // .ttc (TrueType Collection) isn't in Vite's default asset list; treat it as a static asset.
  assetsInclude: ['**/*.ttc'],
  // The .vs/ folder (Visual Studio workspace data) is locked by VS and cannot be
  // watched; exclude it to avoid EBUSY errors from the file watcher.
  server: {
    watch: {
      ignored: ['**/.vs/**'],
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    steamApiPlugin(),
    neteaseApiPlugin(),
    bilibiliApiPlugin(),
    bangumiApiPlugin(),
    anilistApiPlugin(),
    statsApiPlugin(),
    commentsApiPlugin(),
  ],
})
