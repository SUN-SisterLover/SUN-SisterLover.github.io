import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * AniList profile client. Calls are proxied server-side (`/api/anilist`) so
 * the username lives in `.env` (ANILIST_USERNAME) rather than the bundle.
 */

export type AniListStatus = 'CURRENT' | 'COMPLETED' | 'PLANNING' | 'PAUSED' | 'DROPPED'

export type AniListAnime = {
  id: number
  title: string
  cover: string | null
}

export type AniListStats = {
  count: number
  meanScore: number
  minutesWatched: number
  episodesWatched: number
  statuses: { status: AniListStatus; count: number }[]
}

export type AniListProfile = {
  id: number
  name: string
  avatar: string | null
  stats: AniListStats
  favourites: AniListAnime[]
}

type AniListProxyPayload = {
  ok: true
  configured: true
  cached: boolean
  age: number
  fetchedAt: number
  ttl: number
  user: { id: number; name: string; avatar: string | null }
  stats: AniListStats
  favourites: AniListAnime[]
}

type AniListFailure = {
  ok: false
  code: string
  error: string
}

/**
 * Fetch the aggregated profile through the server-side proxy. The username
 * comes from the server's `.env` (ANILIST_USERNAME); when none is configured
 * the proxy reports `configured: false` and we surface it as a
 * `not_configured` error.
 */
export async function fetchAniListProfile(
  { apiBase = '/api/anilist', signal }: {
    apiBase?: string
    signal?: AbortSignal
  } = {},
): Promise<AniListProfile> {
  const url = new URL(`${apiBase.replace(/\/+$/, '')}/profile`, window.location.origin)

  const res = await fetch(url, { signal, headers: { accept: 'application/json' } })

  let body: AniListProxyPayload | AniListFailure | { ok: true; configured: false } | null = null
  try {
    body = (await res.json()) as AniListProxyPayload | AniListFailure | { ok: true; configured: false }
  } catch {
    throw new AniListRequestError(`Bad response from the AniList proxy (${res.status})`, 'bad_response')
  }

  if (!res.ok || !body || body.ok !== true) {
    const failure = body as AniListFailure | null
    throw new AniListRequestError(
      failure?.error ?? `AniList proxy responded with ${res.status}`,
      failure?.code ?? 'request_failed',
    )
  }

  if (body.configured === false) {
    throw new AniListRequestError('AniList identity is not configured on the server', 'not_configured')
  }

  return {
    id: body.user.id,
    name: body.user.name,
    avatar: body.user.avatar,
    stats: body.stats,
    favourites: body.favourites,
  }
}

export class AniListRequestError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'AniListRequestError'
    this.code = code
  }
}

/** Failures that mean "there is no AniList proxy here" (static hosting). */
export const ANILIST_SILENT_CODES = new Set(['bad_response', 'unknown_route'])

type UseAniListOptions = {
  enabled?: boolean
  apiBase?: string
}

export type UseAniListResult = {
  data: AniListProfile | null
  error: AniListRequestError | null
  /** true when the server has no identity configured (`.env` missing ANILIST_USERNAME) */
  notConfigured: boolean
  loading: boolean
  refreshing: boolean
  refresh: () => void
}

/** Load an AniList profile and refresh on demand (data changes slowly). */
export function useAniList(
  { enabled = true, apiBase }: UseAniListOptions = {},
): UseAniListResult {
  const [data, setData] = useState<AniListProfile | null>(null)
  const [error, setError] = useState<AniListRequestError | null>(null)
  const [notConfigured, setNotConfigured] = useState(false)
  const [loading, setLoading] = useState(enabled)
  const [refreshing, setRefreshing] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const load = useCallback(
    async () => {
      if (!enabled) return
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setRefreshing(true)
      try {
        const profile = await fetchAniListProfile({
          apiBase,
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        setData(profile)
        setNotConfigured(false)
        setError(null)
      } catch (err) {
        if (controller.signal.aborted) return
        if (err instanceof Error && err.name === 'AbortError') return
        if (err instanceof AniListRequestError && err.code === 'not_configured') {
          setNotConfigured(true)
          setData(null)
          setError(null)
        } else {
          setNotConfigured(false)
          setError(
            err instanceof AniListRequestError
              ? err
              : new AniListRequestError(
                  err instanceof Error ? err.message : 'AniList request failed',
                  'network_error',
                ),
          )
        }
      } finally {
        if (!controller.signal.aborted) {
          setRefreshing(false)
          setLoading(false)
        }
      }
    },
    [apiBase, enabled],
  )

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    setLoading(true)
    void load()
    return () => abortRef.current?.abort()
  }, [enabled, load])

  const refresh = useCallback(() => void load(), [load])

  return { data, error, notConfigured, loading, refreshing, refresh }
}
