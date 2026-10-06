import { useLang } from '../i18n'
import { SITE_CONFIG } from '../site.config'

export default function FriendLinks() {
  const { t, pick } = useLang()
  const { friends } = SITE_CONFIG
  if (friends.length === 0) return null

  return (
    <section id="friends" className="mx-auto w-full max-w-7xl px-4 pb-16 md:pb-28">
      <div className="border-line border-t pt-10">
        <h2 className="font-mono text-xs tracking-[0.35em] uppercase">
          {t('friends.title')}
          <span className="text-dim ml-3">({friends.length})</span>
        </h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {friends.map((f) => (
            <a
              key={f.url}
              href={f.url}
              target="_blank"
              rel="noreferrer"
              className="group border-line hover:border-accent border p-4 transition-colors"
            >
              <p className="text-paper group-hover:text-accent font-bold tracking-tight transition-colors">
                {f.name}
              </p>
              <p className="text-dim mt-1 text-sm">{pick(f.desc)}</p>
              <p className="text-dim mt-2 font-mono text-[10px] tracking-[0.1em]">
                {f.url.replace(/^https?:\/\//, '')}
              </p>
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}
