import { useEffect, useState } from 'react'

/** Public visit counters for the homepage hero. See `server/stats.mjs`. */
export type StatsPayload = {
  ok: true
  /** All-time page views. */
  total: number
  /** Page views since midnight, Asia/Shanghai. */
  today: number
  /** The Beijing date the `today` count belongs to. */
  date: string
}

export type StatsFailure = {
  ok: false
  code: string
  error: string
}

export class StatsRequestError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'StatsRequestError'
    this.code = code
  }
}

/** Failures that mean "there is no visit counter here" (static hosting). */
export const STATS_SILENT_CODES = new Set(['bad_response', 'unknown_route', 'method_not_allowed'])

const DEFAULT_API_BASE = '/api/stats'

async function readPayload(res: Response): Promise<StatsPayload> {
  let body: StatsPayload | StatsFailure | null = null
  try {
    body = (await res.json()) as StatsPayload | StatsFailure
  } catch {
    throw new StatsRequestError(`Bad response from the visit counter (${res.status})`, 'bad_response')
  }

  if (!res.ok || !body || body.ok !== true) {
    const failure = body as StatsFailure | null
    throw new StatsRequestError(
      failure?.error ?? `Visit counter responded with ${res.status}`,
      failure?.code ?? 'request_failed',
    )
  }

  return body
}

/**
 * Record one page view, returning the updated counters.
 *
 * Counting happens here rather than on every inbound request so that crawlers and
 * link prefetchers — which never run this code — cannot inflate the numbers.
 */
export async function recordVisit({
  apiBase = DEFAULT_API_BASE,
  signal,
}: { apiBase?: string; signal?: AbortSignal } = {}): Promise<StatsPayload> {
  const url = new URL(`${apiBase.replace(/\/+$/, '')}/hit`, window.location.origin)
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: { accept: 'application/json' },
  })
  return readPayload(res)
}

/** Read the counters without recording a view. Used when recording fails. */
export async function fetchStatsSummary({
  apiBase = DEFAULT_API_BASE,
  signal,
}: { apiBase?: string; signal?: AbortSignal } = {}): Promise<StatsPayload> {
  const url = new URL(`${apiBase.replace(/\/+$/, '')}/summary`, window.location.origin)
  const res = await fetch(url, { signal, headers: { accept: 'application/json' } })
  return readPayload(res)
}

/**
 * A visit is recorded once per page load. The promise lives at module scope rather
 * than in a ref so that StrictMode's double-invoked effect — and any second
 * component reading the same counters — reuses one request instead of double-counting.
 */
let inFlight: Promise<StatsPayload> | null = null

function loadOnce(apiBase?: string): Promise<StatsPayload> {
  if (!inFlight) {
    inFlight = (async () => {
      try {
        return await recordVisit({ apiBase })
      } catch {
        // Recording is a write; if it failed, a plain read may still succeed.
        return await fetchStatsSummary({ apiBase })
      }
    })()
    // The caller may unmount before settling; keep that from surfacing as unhandled.
    inFlight.catch(() => {})
  }
  return inFlight
}

export type UseStatsResult = {
  data: StatsPayload | null
  error: StatsRequestError | null
  /** true when this deployment has no visit counter, so the hero hides the numbers */
  silent: boolean
  loading: boolean
}

/** Loads the public visit counters once per page load. */
export function useStats({
  enabled = true,
  apiBase,
}: { enabled?: boolean; apiBase?: string } = {}): UseStatsResult {
  const [data, setData] = useState<StatsPayload | null>(null)
  const [error, setError] = useState<StatsRequestError | null>(null)
  const [silent, setSilent] = useState(false)
  const [loading, setLoading] = useState(enabled)

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    // A hidden tab has not been looked at, so it should not count as a visit.
    if (document.visibilityState !== 'visible') {
      setLoading(false)
      return
    }

    let cancelled = false
    loadOnce(apiBase)
      .then((payload) => {
        if (cancelled) return
        setData(payload)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const failure =
          err instanceof StatsRequestError
            ? err
            : new StatsRequestError(
                err instanceof Error ? err.message : 'Visit counter request failed',
                'network_error',
              )
        if (STATS_SILENT_CODES.has(failure.code)) setSilent(true)
        else setError(failure)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [enabled, apiBase])

  return { data, error, silent, loading }
}
