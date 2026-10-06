import { useLang } from '../i18n'

export default function Pagination({
  page,
  total,
  onChange,
}: {
  page: number
  total: number
  onChange: (p: number) => void
}) {
  const { t } = useLang()
  if (total <= 1) return null

  const pages = Array.from({ length: total }, (_, i) => i + 1)
  const cls = (active: boolean) =>
    `inline-flex min-w-8 items-center justify-center border px-2 py-1 font-mono text-[11px] tracking-[0.15em] transition-colors ${
      active ? 'border-line text-accent' : 'text-dim hover:text-paper border-transparent'
    }`

  return (
    <nav aria-label="pagination" className="mt-10 flex flex-wrap items-center justify-center gap-1.5">
      <button
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
        className={`${cls(false)} disabled:pointer-events-none disabled:opacity-30`}
      >
        {t('pagination.prev')}
      </button>
      {pages.map((n) => (
        <button
          key={n}
          aria-current={n === page ? 'page' : undefined}
          onClick={() => onChange(n)}
          className={cls(n === page)}
        >
          {n}
        </button>
      ))}
      <button
        disabled={page === total}
        onClick={() => onChange(page + 1)}
        className={`${cls(false)} disabled:pointer-events-none disabled:opacity-30`}
      >
        {t('pagination.next')}
      </button>
    </nav>
  )
}
