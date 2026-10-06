/**
 * NetEase Cloud Music frontend API client.
 *
 * Fetches data through the server-side proxy (`/api/netease/*`) so the
 * browser never calls the NetEase API directly.  Mirrors `src/lib/steam.ts`.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { SITE_CONFIG } from '../site.config'

// ── types ─────────────────────────────────────────────────

export type NeteaseSong = {
  id: number
  name: string
  artist: string
  album: string
  cover: string
  duration: number     // ms
  url: string | null
}

export type NeteasePlaylist = {
  id: number
  name: string
  cover: string
  trackCount: number
  tracks: NeteaseSong[]
}

export type NeteaseRecordItem = {
  playCount: number
  song: NeteaseSong
}

// ── helpers ───────────────────────────────────────────────

function neCfg() {
  return SITE_CONFIG.netease
}

async function apiGet<T>(
  path: string,
  params: Record<string, string | number>,
  signal?: AbortSignal,
): Promise<T> {
  const base = neCfg().apiBase.replace(/\/+$/, '')
  const url = new URL(`${base}${path}`, window.location.origin)
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    url.searchParams.set(k, String(v))
  }

  const res = await fetch(url, { signal, headers: { accept: 'application/json' } })

  let body: any = null
  try {
    body = await res.json()
  } catch {
    throw new NeteaseRequestError(`Bad response from the NetEase proxy (${res.status})`, 'bad_response')
  }

  if (!res.ok || !body?.ok) {
    throw new NeteaseRequestError(
      body?.error ?? `NetEase proxy responded with ${res.status}`,
      body?.code ?? 'request_failed',
    )
  }

  return body as T
}

export class NeteaseRequestError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'NeteaseRequestError'
    this.code = code
  }
}

// ── API functions ─────────────────────────────────────────

export async function fetchNeteaseSearch(
  kw: string,
  limit = 20,
  signal?: AbortSignal,
): Promise<NeteaseSong[]> {
  const data = await apiGet<{ ok: true; songs: NeteaseSong[] }>(
    '/search', { kw, limit }, signal,
  )
  return data.songs
}

export async function fetchNeteaseSongUrl(
  id: number,
  br = 320000,
  signal?: AbortSignal,
): Promise<string | null> {
  const data = await apiGet<{ ok: true; url: string | null }>(
    '/song/url', { id, br }, signal,
  )
  return data.url
}

export async function fetchNeteasePlaylist(
  id: number,
  signal?: AbortSignal,
): Promise<NeteasePlaylist> {
  const data = await apiGet<NeteasePlaylist & { ok: true }>(
    '/playlist/detail', { id }, signal,
  )
  const { ok, ...playlist } = data as any
  return playlist as NeteasePlaylist
}

export async function fetchNeteaseUserRecord(
  uid: number,
  type: 0 | 1 = 1,
  signal?: AbortSignal,
): Promise<NeteaseRecordItem[]> {
  const data = await apiGet<{ ok: true; record: NeteaseRecordItem[] }>(
    '/user/record', { uid, type }, signal,
  )
  return data.record
}

export async function fetchNeteaseLyric(
  id: number,
  signal?: AbortSignal,
): Promise<string | null> {
  const data = await apiGet<{ ok: true; lyric: string | null }>(
    '/lyric', { id }, signal,
  )
  return data.lyric
}

// ── hook: useNeteaseRecord ────────────────────────────────

type UseNeteaseRecordOptions = {
  enabled?: boolean
  intervalMs?: number
}

export type UseNeteaseRecordResult = {
  data: NeteaseRecordItem[] | null
  loading: boolean
  error: NeteaseRequestError | null
  refresh: () => void
}

/**
 * Poll the NetEase proxy for the user's listening records.
 *
 * Polling pauses while the tab is hidden and resumes when it becomes
 * visible again, so a backgrounded tab never wastes resources.
 */
export function useNeteaseRecord(
  uid: number,
  { enabled = true, intervalMs = 60_000 }: UseNeteaseRecordOptions = {},
): UseNeteaseRecordResult {
  const [data, setData] = useState<NeteaseRecordItem[] | null>(null)
  const [loading, setLoading] = useState(enabled && Boolean(uid))
  const [error, setError] = useState<NeteaseRequestError | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    if (!enabled || !uid) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const record = await fetchNeteaseUserRecord(uid, 1, controller.signal)
      if (controller.signal.aborted) return
      setData(record)
      setError(null)
    } catch (err) {
      if (controller.signal.aborted) return
      if (err instanceof Error && err.name === 'AbortError') return
      setError(
        err instanceof NeteaseRequestError
          ? err
          : new NeteaseRequestError(
              err instanceof Error ? err.message : 'Request failed',
              'network_error',
            ),
      )
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false)
      }
    }
  }, [enabled, uid])

  useEffect(() => {
    if (!enabled || !uid) {
      setLoading(false)
      return
    }

    setLoading(true)
    void load()

    const tick = () => {
      if (document.visibilityState === 'hidden') return
      void load()
    }
    const timer = window.setInterval(tick, Math.max(15_000, intervalMs))

    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      abortRef.current?.abort()
    }
  }, [enabled, uid, intervalMs, load])

  const refresh = useCallback(() => {
    void load()
  }, [load])

  return { data, loading, error, refresh }
}

// ── formatting utilities ──────────────────────────────────

/** Format duration from seconds to a human-readable string. */
export function formatDuration(seconds: number, lang: 'zh' | 'en'): string {
  if (!seconds || seconds <= 0) return lang === 'zh' ? '未听' : 'never'
  if (seconds < 60) return `${seconds}${lang === 'zh' ? ' 秒' : 's'}`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}${lang === 'zh' ? ' 分钟' : ' min'}`
  const hours = minutes / 60
  const value = hours >= 100 ? Math.round(hours) : Math.round(hours * 10) / 10
  return `${value}${lang === 'zh' ? ' 小时' : ' h'}`
}

/** Relative "x minutes ago" label. */
export function formatAgo(timestampMs: number, lang: 'zh' | 'en'): string {
  const seconds = Math.max(0, Math.round((Date.now() - timestampMs) / 1000))
  if (seconds < 10) return lang === 'zh' ? '刚刚' : 'just now'
  if (seconds < 60) return lang === 'zh' ? `${seconds} 秒前` : `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return lang === 'zh' ? `${minutes} 分钟前` : `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  return lang === 'zh' ? `${hours} 小时前` : `${hours}h ago`
}
