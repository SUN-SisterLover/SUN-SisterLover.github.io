import { useLang } from '../i18n'
import { SITE_CONFIG } from '../site.config'
import { useComments } from '../lib/comments'
import CommentForm from './CommentForm'
import CommentList from './CommentList'

/**
 * The comment thread belonging to a single article, keyed by `post.id`.
 *
 * The scope is the whole difference from the homepage guestbook: the same hook,
 * list and form, but `postId` makes the server return only this article's
 * comments, and `useComments` keeps the seeded homepage comments out of it.
 */
export default function PostComments({ postId }: { postId: string }) {
  const { t } = useLang()
  const { enabled, apiBase } = SITE_CONFIG.comments
  const { comments, error, silent, loading, submitting, submit } = useComments({
    postId,
    enabled,
    apiBase,
  })

  // No comment service here (static hosting) — hide the whole thread.
  if (!enabled || silent) return null

  return (
    <section className="border-line mt-12 border-t pt-8">
      <h2 className="font-mono text-xs tracking-[0.35em] uppercase">
        {t('comments.count')}
        {comments.length > 0 && <span className="text-dim ml-3">({comments.length})</span>}
      </h2>

      {loading && <p className="text-dim py-6 font-mono text-xs">…</p>}
      {/* Same rule as `CommentBoard`: an error never hides a thread we still have. */}
      {!loading && error && comments.length === 0 && (
        <p className="text-dim py-6 font-mono text-xs">{t('comments.loadFailed')}</p>
      )}
      {!loading && (!error || comments.length > 0) && <CommentList comments={comments} />}

      {/* `submitting` is the hook's own flag — see the note in `CommentBoard`. */}
      <CommentForm onSubmit={submit} submitting={submitting} />
    </section>
  )
}
