import { useRef, useState, type FormEvent } from 'react'
import { useLang } from '../i18n'
import {
  COMMENTS_AUTHOR_MAX,
  COMMENTS_RATE_LIMITED,
  COMMENTS_TEXT_MAX,
  type CommentSubmitResult,
} from '../lib/comments'

/**
 * The one comment form, shared by the homepage guestbook and every article
 * thread — two copies would drift.
 *
 * `website` is a honeypot: it is hidden from people (and from assistive tech),
 * so anything a bot types there marks the submission as automated.
 */
export default function CommentForm({
  onSubmit,
  submitting,
}: {
  onSubmit: (author: string, text: string, website: string) => Promise<CommentSubmitResult>
  submitting: boolean
}) {
  const { t } = useLang()
  const [author, setAuthor] = useState('')
  const [text, setText] = useState('')
  const [website, setWebsite] = useState('')
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  /** Synchronous submit guard — see `handleSubmit`. */
  const inFlight = useRef(false)

  // Editing a field invalidates the last notice: a stale "send failed" sitting
  // next to a field being retyped reads as if the new text failed too.
  const changeAuthor = (value: string) => {
    setAuthor(value)
    setNotice(null)
  }

  const changeText = (value: string) => {
    setText(value)
    setNotice(null)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    // A disabled button does not stop Enter inside a text field from submitting the
    // form, and the `submitting` prop cannot cover it either: two submits in the same
    // JS task both read the same stale value, because React has not re-rendered
    // between them. This ref flips synchronously, so the second one exits here.
    // Correctness must not depend on what the caller passes as `submitting` — that
    // prop is now only what greys the button out.
    if (inFlight.current) return
    inFlight.current = true
    try {
      if (!author.trim() || !text.trim()) {
        setNotice({ tone: 'bad', text: t('comments.needNameAndBody') })
        return
      }
      // `maxLength` already caps both fields in the browser and the counter below
      // reports the same raw length, so this guard only catches what slipped past
      // it. Counting UTF-16 units is stricter than the server's code-point count:
      // it can reject early, never let an over-long comment through.
      if (author.length > COMMENTS_AUTHOR_MAX || text.length > COMMENTS_TEXT_MAX) {
        setNotice({ tone: 'bad', text: t('comments.tooLong') })
        return
      }

      let result: CommentSubmitResult
      try {
        result = await onSubmit(author, text, website)
      } catch {
        // `onSubmit` promises a result rather than a throw. If a future caller breaks
        // that promise, the visitor still gets a failure message instead of silence.
        result = { ok: false, code: 'network_error' }
      }

      if (result.ok) {
        // Clear the body directly rather than through `changeText`, which would
        // wipe the notice we are about to set.
        setText('')
        setNotice({ tone: 'ok', text: t('comments.sent') })
      } else {
        setNotice({
          tone: 'bad',
          text: result.code === COMMENTS_RATE_LIMITED ? t('comments.tooFast') : t('comments.sendFailed'),
        })
      }
    } finally {
      // Also reached by every `return` above, so an invalid submit cannot leave the
      // form permanently locked.
      inFlight.current = false
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border-line mt-6 border-t pt-6">
      <div className="flex flex-col gap-4 md:flex-row">
        <label className="md:w-48">
          <span className="text-dim font-mono text-[10px] tracking-[0.25em] uppercase">
            {t('comments.name')}
          </span>
          <input
            value={author}
            onChange={(e) => changeAuthor(e.target.value)}
            maxLength={COMMENTS_AUTHOR_MAX}
            placeholder={t('comments.namePlaceholder')}
            className="border-line bg-ink/40 text-paper placeholder:text-dim focus:border-accent mt-2 w-full rounded-none border px-3 py-2 text-sm outline-none"
          />
        </label>

        <label className="flex-1">
          <span className="text-dim font-mono text-[10px] tracking-[0.25em] uppercase">
            {t('comments.body')}
          </span>
          <textarea
            value={text}
            onChange={(e) => changeText(e.target.value)}
            maxLength={COMMENTS_TEXT_MAX}
            rows={3}
            placeholder={t('comments.bodyPlaceholder')}
            className="border-line bg-ink/40 text-paper placeholder:text-dim focus:border-accent mt-2 w-full resize-y border px-3 py-2 text-sm outline-none"
          />
        </label>
      </div>

      {/*
        Honeypot. `hidden` keeps it away from both sighted users and screen
        readers; `tabIndex={-1}` stops keyboard users landing in it.
      */}
      <label hidden aria-hidden="true">
        website
        <input
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
        />
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={submitting}
          className="bg-accent text-night hover:bg-accent-2 disabled:opacity-50 px-5 py-2 font-mono text-xs font-bold tracking-[0.2em] uppercase transition-colors"
        >
          {submitting ? t('comments.sending') : t('comments.submit')}
        </button>
        {/*
          The live region stays mounted and only its text changes: a `role=status`
          element that is inserted already holding its message is announced
          unreliably, because screen readers register live regions on mount.
        */}
        <span
          role="status"
          className={notice?.tone === 'ok' ? 'text-accent font-mono text-xs' : 'text-dim font-mono text-xs'}
        >
          {notice?.text ?? ''}
        </span>
        <span className="text-dim ml-auto font-mono text-[10px] tracking-[0.2em]">
          {text.length}/{COMMENTS_TEXT_MAX}
        </span>
      </div>
    </form>
  )
}
