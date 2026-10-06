import { useLang } from '../i18n'
import { SITE_CONFIG } from '../site.config'
import { useComments } from '../lib/comments'
import CommentForm from './CommentForm'
import CommentList from './CommentList'

/**
 * The homepage guestbook. It sits below the article list rather than in the hero:
 * the hero's comments terminal is a decorative typewriter, not a list, and kept
 * its own place.
 *
 * It renders on the homepage branch of `App`'s routing ternary only, so an open
 * article replaces it rather than showing both threads at once.
 */
export default function CommentBoard() {
  const { t } = useLang()
  const { enabled, apiBase } = SITE_CONFIG.comments
  const { comments, error, silent, loading, submitting, submit } = useComments({
    postId: null,
    enabled,
    apiBase,
  })

  // No comment service here (static hosting) — hide the whole board.
  if (!enabled || silent) return null

  return (
    <section id="guestbook" className="mx-auto w-full max-w-7xl px-4 pb-16 md:pb-28">
      <div className="border-line border-t pt-10">
        <h2 className="font-mono text-xs tracking-[0.35em] uppercase">
          {t('comments.title')}
          {comments.length > 0 && <span className="text-dim ml-3">({comments.length})</span>}
        </h2>

        {loading && <p className="text-dim py-6 font-mono text-xs">…</p>}
        {/* Never swap a thread we can still show for an error line: a failed
            refresh after a successful post would otherwise blank the comments the
            visitor was reading. The error only speaks when there is nothing to show. */}
        {!loading && error && comments.length === 0 && (
          <p className="text-dim py-6 font-mono text-xs">{t('comments.loadFailed')}</p>
        )}
        {!loading && (!error || comments.length > 0) && <CommentList comments={comments} />}

        {/*
          `submitting` comes from `useComments` so the button can render its
          disabled state. It is NOT what prevents a double submit: a prop cannot be
          relied on to have flipped within the same JS task, so two submits in one
          task both saw `false` and both posted. That guard lives in
          `CommentForm`'s own in-flight ref — do not delete it as redundant.
        */}
        <CommentForm onSubmit={submit} submitting={submitting} />
      </div>
    </section>
  )
}
