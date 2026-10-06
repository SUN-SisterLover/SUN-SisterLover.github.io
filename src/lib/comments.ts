import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { COMMENTS } from '../data/comments'

/**
 * Visitor comments for the homepage guestbook and per-article threads.
 * See `server/comments.mjs` for the API this talks to.
 */
export type VisitorComment = {
  id: string
  author: string
  text: string
  /** `null` means the homepage guestbook. */
  postId: string | null
  createdAt: string
}

/** What the UI renders: static seeded comments have no id or timestamp. */
export type DisplayComment = {
  id: string
  author: string
  text: string
  createdAt: string | null
}

export class CommentsRequestError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'CommentsRequestError'
    this.code = code
  }
}

/**
 * What a submission attempt reports back. The code matters to the UI: a rate
 * limit deserves its own wording, everything else shares one message. A union
 * rather than `{ ok: boolean; code?: string }`, so a failure is guaranteed to
 * carry a code the caller can branch on.
 */
export type CommentSubmitResult = { ok: true } | { ok: false; code: string }

/** Failures that mean "there is no comment service here" (static hosting). */
export const COMMENTS_SILENT_CODES = new Set(['bad_response', 'unknown_route', 'method_not_allowed'])

/**
 * The server's 429 code for "you posted too recently" — mirrors the literal in
 * `server/comments.mjs`. It lives here, next to `COMMENTS_SILENT_CODES`, so the
 * UI never spells out a code the server owns.
 */
export const COMMENTS_RATE_LIMITED = 'too_many_requests'

/** Mirrors `AUTHOR_MAX` / `TEXT_MAX` in `server/comments.mjs`. */
export const COMMENTS_AUTHOR_MAX = 24
export const COMMENTS_TEXT_MAX = 500

const DEFAULT_API_BASE = '/api/comments'

function base(apiBase?: string) {
  return (apiBase ?? DEFAULT_API_BASE).replace(/\/+$/, '')
}

/**
 * The API answers `{ ok: true, ... }` or `{ ok: false, code, error }`. A body that
 * is not that shape at all — an HTML 404 page from static hosting, say — is
 * reported as `bad_response` so the caller can treat it as "no service here".
 */
async function readJson(res: Response): Promise<Record<string, unknown>> {
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    throw new CommentsRequestError(`Bad response from the comment service (${res.status})`, 'bad_response')
  }
  const record = body as Record<string, unknown> | null
  if (!res.ok || !record || record.ok !== true) {
    throw new CommentsRequestError(
      typeof record?.error === 'string' ? record.error : `Comment service responded with ${res.status}`,
      typeof record?.code === 'string' ? record.code : 'request_failed',
    )
  }
  return record
}

/** Comments for one scope: `null` is the homepage guestbook, otherwise a post id. */
export async function fetchComments({
  postId = null,
  apiBase,
  signal,
}: { postId?: string | null; apiBase?: string; signal?: AbortSignal } = {}): Promise<VisitorComment[]> {
  const url = new URL(base(apiBase), window.location.origin)
  if (postId) url.searchParams.set('post', postId)
  const res = await fetch(url, { signal, headers: { accept: 'application/json' } })
  const body = await readJson(res)
  return Array.isArray(body.comments) ? (body.comments as VisitorComment[]) : []
}

/**
 * Post a comment. `website` is the honeypot — it is never shown to a person, so a
 * non-empty value means a bot; the server then accepts and discards it, which is
 * why this resolves with `null` rather than a comment in that case.
 */
export async function submitComment({
  author,
  text,
  postId = null,
  website = '',
  apiBase,
}: {
  author: string
  text: string
  postId?: string | null
  website?: string
  apiBase?: string
}): Promise<VisitorComment | null> {
  const res = await fetch(new URL(base(apiBase), window.location.origin), {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ author, text, postId, website }),
  })
  const body = await readJson(res)
  return (body.comment as VisitorComment | null) ?? null
}

/** Admin-only. `adminKey` is the value of `COMMENTS_ADMIN_KEY` on the server. */
export async function deleteComment({
  id,
  adminKey,
  apiBase,
}: {
  id: string
  adminKey: string
  apiBase?: string
}): Promise<void> {
  const res = await fetch(`${new URL(base(apiBase), window.location.origin).toString()}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'x-admin-key': adminKey, accept: 'application/json' },
  })
  await readJson(res)
}

/** Same fixed offset as `CN_OFFSET_MS` in `server/stats.mjs`. */
const CN_OFFSET_MS = 8 * 60 * 60 * 1000

/**
 * A comment's calendar date in Asia/Shanghai as 'YYYY-MM-DD'.
 *
 * Not `iso.slice(0, 10)`: the server stores UTC, so that would show the previous
 * day for anything posted between 00:00 and 08:00 Beijing time. Not
 * `toLocaleDateString()` either — that would date each visitor's view by their own
 * timezone, while every other date on this site is Beijing time. China has had no
 * DST since 1991, so a fixed offset is always correct and avoids pulling in ICU.
 *
 * Returns '' for a value that is not a parseable timestamp.
 */
export function formatCommentDate(iso: string): string {
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return ''
  return new Date(time + CN_OFFSET_MS).toISOString().slice(0, 10)
}

/**
 * The seeded comments in `comments/*.md` belong to the homepage only — they are
 * not attached to any article. The index is part of the id because an author may
 * write the same line twice, and React keys have to stay distinct.
 */
function seededFor(postId: string | null): DisplayComment[] {
  if (postId) return []
  return COMMENTS.map((c, index) => ({
    id: `seed:${index}:${c.author}:${c.text}`,
    author: c.author,
    text: c.text,
    createdAt: null,
  }))
}

export type UseCommentsResult = {
  comments: DisplayComment[]
  /**
   * A failure to *load* the thread, and nothing else. A rejected submit is
   * reported through `submit`'s result instead — see the note there — because
   * the callers replace the whole list with a "could not load" line whenever
   * this is set, which is the wrong thing to do to a list that is still there.
   */
  error: CommentsRequestError | null
  /** true when this deployment has no comment service, so the thread stays hidden */
  silent: boolean
  loading: boolean
  submitting: boolean
  /**
   * `{ ok: false, code }` when the comment was rejected. `code` is all the caller
   * needs to choose its wording, so a rejected submit deliberately leaves `error`
   * untouched.
   */
  submit: (author: string, text: string, website?: string) => Promise<CommentSubmitResult>
  refresh: () => void
}

/**
 * The one place the seeded comments and the fetched ones meet: the homepage shows
 * both, an article shows only its own visitor comments.
 *
 * Visitor comments come first, newest at the top — that is the feedback loop a
 * guestbook lives on, and the server already returns them newest first. The
 * seeded comments carry no timestamp and so take no part in that ordering; they
 * sit at the tail, where they read as the welcome note under the live thread.
 */
export function useComments({
  postId = null,
  enabled = true,
  apiBase,
}: { postId?: string | null; enabled?: boolean; apiBase?: string } = {}): UseCommentsResult {
  const [fetched, setFetched] = useState<VisitorComment[]>([])
  const [error, setError] = useState<CommentsRequestError | null>(null)
  const [silent, setSilent] = useState(false)
  const [loading, setLoading] = useState(enabled)
  const [submitting, setSubmitting] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    if (!enabled) return
    // A slower earlier request must not overwrite the newer result.
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const list = await fetchComments({ postId, apiBase, signal: controller.signal })
      if (controller.signal.aborted) return
      setFetched(list)
      setError(null)
    } catch (err) {
      if (controller.signal.aborted) return
      if (err instanceof Error && err.name === 'AbortError') return
      const failure =
        err instanceof CommentsRequestError
          ? err
          : new CommentsRequestError(err instanceof Error ? err.message : 'Comment request failed', 'network_error')
      if (COMMENTS_SILENT_CODES.has(failure.code)) setSilent(true)
      else setError(failure)
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [apiBase, enabled, postId])

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    void load()
    return () => abortRef.current?.abort()
  }, [enabled, load])

  const submit = useCallback(
    async (author: string, text: string, website = ''): Promise<CommentSubmitResult> => {
      setSubmitting(true)
      try {
        const created = await submitComment({ author, text, postId, website, apiBase })
        // Put the visitor's own comment in the list immediately rather than waiting
        // on the refresh below. If that refresh then fails, `load` sets `error`, and
        // without this the visitor would be told 发送成功 while their comment was
        // nowhere to be seen. A successful refresh replaces the whole array, so this
        // never duplicates.
        if (created) setFetched((current) => [created, ...current])
        await load()
        return { ok: true }
      } catch (err) {
        // Deliberately no `setError` here. `error` gates the thread itself — both
        // consumers swap the list for a "could not load" line when it is set — so
        // reporting a rejected submit through it would blank the comments the
        // visitor was reading. That is the normal outcome of posting twice inside
        // a minute: the server answers 429, and the visitor would lose the whole
        // thread to a message that also misnames what failed. Only `load` owns
        // `error`; the form owns the wording for a failure to send.
        const failure =
          err instanceof CommentsRequestError
            ? err
            : new CommentsRequestError(err instanceof Error ? err.message : 'Comment request failed', 'network_error')
        // A failure that is not a CommentsRequestError — a thrown fetch, say — was
        // wrapped above, so `code` is always something the caller can branch on.
        return { ok: false, code: failure.code }
      } finally {
        setSubmitting(false)
      }
    },
    [apiBase, load, postId],
  )

  // Memoised so the merged list keeps one identity per data change. Callers hand
  // this to `useGSAP`/`useEffect` dependency arrays, and a fresh array on every
  // render would rebuild those effects — for the hero typewriter that means
  // restarting the timeline on renders that changed nothing.
  const comments = useMemo(
    () => [
      ...fetched.map((c) => ({ id: c.id, author: c.author, text: c.text, createdAt: c.createdAt })),
      ...seededFor(postId),
    ],
    [fetched, postId],
  )

  return {
    comments,
    error,
    silent,
    loading,
    submitting,
    submit,
    refresh: () => void load(),
  }
}
