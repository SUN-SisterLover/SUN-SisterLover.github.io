import { useLang } from '../i18n'
import { formatCommentDate, type DisplayComment } from '../lib/comments'

/** Renders a scope's comments, newest first. */
export default function CommentList({ comments }: { comments: DisplayComment[] }) {
  const { t } = useLang()

  if (comments.length === 0) {
    return <p className="text-dim py-6 font-mono text-xs">{t('comments.empty')}</p>
  }

  return (
    <ul className="divide-line divide-y">
      {comments.map((comment) => {
        // Beijing time, not the raw UTC date — see `formatCommentDate`.
        const date = comment.createdAt ? formatCommentDate(comment.createdAt) : ''
        return (
          <li key={comment.id} className="py-5">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <span className="text-paper text-sm font-bold break-words">{comment.author}</span>
              {/* `dateTime` keeps the full ISO instant; only the label is localised. */}
              {comment.createdAt && date && (
                <time className="text-dim font-mono text-[10px] tracking-[0.2em]" dateTime={comment.createdAt}>
                  {date}
                </time>
              )}
            </div>
            <p className="text-paper/90 mt-2 text-sm leading-relaxed break-words whitespace-pre-wrap">
              {comment.text}
            </p>
          </li>
        )
      })}
    </ul>
  )
}
