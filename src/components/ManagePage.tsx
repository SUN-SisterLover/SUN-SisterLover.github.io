import { useCallback, useEffect, useState } from 'react'
import { CommentsRequestError, deleteComment, fetchComments, type VisitorComment } from '../lib/comments'
import { SITE_CONFIG } from '../site.config'
import { POSTS } from '../data/posts'

/** Post ids are known at build time, which is what lets the page list every scope. */
const KNOWN_POST_IDS = POSTS.map((p) => p.id)

/** Where the key is remembered between visits. Never the URL — see `ManagePage`. */
const KEY_STORAGE = 'nagi-blog-admin-key'

/**
 * Owner-only moderation page at /manage.
 *
 * The admin key travels only in the `x-admin-key` request header (see
 * `deleteComment`). It is deliberately never put in the URL: a query string or
 * hash would leak it into browser history, into the `Referer` of any outbound
 * link, and into the server's access log.
 *
 * Every visitor-authored string on this page (`author`, `text`) is rendered as a
 * React child, which React escapes. That is the only safe sink: an API that
 * writes markup — `dangerouslySetInnerHTML`, `.innerHTML`, or a library call that
 * turns out to be one, as GSAP's TextPlugin did — would turn a stored comment
 * into stored XSS.
 */
export default function ManagePage({ onExit }: { onExit: () => void }) {
  const { apiBase } = SITE_CONFIG.comments
  const [adminKey, setAdminKey] = useState('')
  const [unlocked, setUnlocked] = useState(false)
  const [all, setAll] = useState<VisitorComment[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const saved = localStorage.getItem(KEY_STORAGE)
    if (saved) setAdminKey(saved)

    // This page is for the owner alone; keep it out of search results.
    const robots = document.createElement('meta')
    robots.name = 'robots'
    robots.content = 'noindex'
    document.head.appendChild(robots)
    return () => {
      document.head.removeChild(robots)
    }
  }, [])

  /**
   * The API is scoped per post, so listing everything means asking once for the
   * guestbook and once per known article. `null` is the homepage scope.
   *
   * Nothing here is authenticated: reads are public, so a wrong key still shows
   * the list. Only deleting checks it.
   */
  const loadAll = useCallback(async () => {
    setBusy(true)
    setMessage('')
    try {
      const scopes: (string | null)[] = [null, ...KNOWN_POST_IDS]
      const groups = await Promise.all(scopes.map((postId) => fetchComments({ postId, apiBase })))
      const flat = groups.flat()
      flat.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      setAll(flat)
      setUnlocked(true)
    } catch (err) {
      setUnlocked(false)
      setMessage(err instanceof CommentsRequestError ? `加载失败：${err.message}` : '加载失败')
    } finally {
      setBusy(false)
    }
  }, [apiBase])

  const handleDelete = async (id: string) => {
    setBusy(true)
    setMessage('')
    try {
      await deleteComment({ id, adminKey: adminKey.trim(), apiBase })
      setAll((current) => current.filter((c) => c.id !== id))
      setMessage('已删除')
    } catch (err) {
      if (err instanceof CommentsRequestError && err.code === 'not_configured') {
        setMessage('服务器未配置 COMMENTS_ADMIN_KEY，删除接口已关闭。')
      } else if (err instanceof CommentsRequestError && err.code === 'unauthorized') {
        setMessage('密钥不正确。')
      } else {
        setMessage('删除失败，请稍后重试。')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-[100dvh] px-4 py-16">
      <div className="mx-auto max-w-3xl">
        <button onClick={onExit} className="text-dim hover:text-accent font-mono text-xs tracking-[0.2em]">
          ← 返回首页
        </button>

        <h1 className="mt-8 font-mono text-sm tracking-[0.35em] uppercase">留言管理</h1>

        <div className="border-line mt-6 flex flex-wrap items-end gap-4 border-t pt-6">
          <label className="flex-1">
            <span className="text-dim font-mono text-[10px] tracking-[0.25em] uppercase">管理密钥</span>
            <input
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              type="password"
              placeholder="COMMENTS_ADMIN_KEY"
              className="border-line bg-ink/40 text-paper mt-2 w-full border px-3 py-2 text-sm outline-none"
            />
          </label>
          <button
            onClick={() => {
              // Stored trimmed, like the server trims its own key, so a pasted
              // trailing newline cannot make a later visit fail.
              localStorage.setItem(KEY_STORAGE, adminKey.trim())
              void loadAll()
            }}
            disabled={busy || !adminKey.trim()}
            className="bg-accent text-night disabled:opacity-50 px-5 py-2 font-mono text-xs font-bold tracking-[0.2em] uppercase"
          >
            {busy ? '加载中…' : '载入留言'}
          </button>
        </div>

        {message && <p className="text-dim mt-4 font-mono text-xs">{message}</p>}

        {unlocked && (
          <>
            <p className="text-dim mt-8 font-mono text-xs">共 {all.length} 条</p>
            <ul className="divide-line divide-y">
              {all.map((comment) => (
                <li key={comment.id} className="flex items-start gap-4 py-5">
                  <div className="min-w-0 flex-1">
                    <div className="text-dim font-mono text-[10px] tracking-[0.2em]">
                      {comment.createdAt.slice(0, 16).replace('T', ' ')} ·{' '}
                      {comment.postId ?? '首页留言板'}
                    </div>
                    <div className="text-paper mt-1 text-sm font-bold break-words">{comment.author}</div>
                    <p className="text-paper/90 mt-1 text-sm break-words whitespace-pre-wrap">{comment.text}</p>
                  </div>
                  <button
                    onClick={() => void handleDelete(comment.id)}
                    disabled={busy}
                    className="text-dim hover:text-accent shrink-0 font-mono text-xs tracking-[0.2em] disabled:opacity-50"
                  >
                    删除
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
