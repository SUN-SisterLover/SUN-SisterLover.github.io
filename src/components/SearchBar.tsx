import { useLang } from '../i18n'

export default function SearchBar({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const { t } = useLang()
  return (
    <div className="relative">
      <span className="bg-accent absolute top-1/2 left-0 h-4 w-[2px] -translate-y-1/2" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('search.placeholder')}
        aria-label={t('search.placeholder')}
        className="text-paper placeholder:text-dim focus:border-accent border-line w-full border bg-transparent py-2 pr-3 pl-4 font-mono text-xs tracking-[0.15em] transition-colors focus:outline-none"
      />
    </div>
  )
}
