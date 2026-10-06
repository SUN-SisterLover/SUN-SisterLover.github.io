import { useState } from 'react'
import { Clapperboard, RefreshCw } from 'lucide-react'
import { useLang } from '../i18n'
import { SITE_CONFIG } from '../site.config'
import { useBangumi } from '../lib/bangumi'
import { useAniList } from '../lib/anilist'
import FloatingPlaceholder from './FloatingPlaceholder'

// Match the floating-card motion used by FloatingPlayer / FloatingSteam.
const EASE = 'var(--ease-drawer)'
const DURATION_IN = '450ms'
const DURATION_OUT = '270ms'

/**
 * Bottom-right anime card: Bangumi (left) + AniList (right) stats in one
 * expanding card, with the current Bangumi watch-list underneath. Each source
 * loads independently; a source without identity hides its own half, and the
 * whole card removes itself when both are unconfigured or absent.
 */
export default function FloatingAnime() {
  const bCfg = SITE_CONFIG.bangumi
  const aCfg = SITE_CONFIG.anilist
  const { t } = useLang()
  const [collapsed, setCollapsed] = useState(true)

  const bEnabled = bCfg.enabled
  const aEnabled = aCfg.enabled

  const bangumi = useBangumi({
    enabled: bEnabled,
    apiBase: bCfg.apiBase,
  })
  const anilist = useAniList({
    enabled: aEnabled,
    apiBase: aCfg.apiBase,
  })

  if (!bEnabled && !aEnabled) return null

  // Both sources unconfigured — show a dimmed placeholder so the card stays visible.
  const bNot = bEnabled && bangumi.notConfigured
  const aNot = aEnabled && anilist.notConfigured
  if (bNot && aNot) {
    return (
      <FloatingPlaceholder
        icon={<Clapperboard className="size-6" />}
        title={t('datawall.anime.title')}
        hint={t('datawall.configHint')}
      />
    )
  }

  const bVisible = bEnabled && !bangumi.notConfigured && bangumi.data
  const aVisible = aEnabled && !anilist.notConfigured && anilist.data
  if (!bVisible && !aVisible) return null

  const bStats = bangumi.data?.stats
  const doing = bangumi.data?.collections.filter((c) => c.type === 3) ?? []
  const aStats = anilist.data?.stats
  const current = aStats?.statuses.find((s) => s.status === 'CURRENT')?.count ?? 0

  const refreshing = bangumi.refreshing || anilist.refreshing

  return (
    <div
      onMouseEnter={() => setCollapsed(false)}
      onMouseLeave={() => setCollapsed(true)}
      className={`relative z-50 origin-bottom-right scale-[1.2] overflow-hidden rounded-2xl border bg-ink/80 shadow-xl backdrop-blur-md ${
        collapsed ? 'w-16 border-transparent' : 'w-[340px] border-ink-2/20'
      }`}
      style={{
        transitionProperty: 'width, border-color',
        transitionDuration: collapsed ? DURATION_OUT : DURATION_IN,
        transitionTimingFunction: EASE,
      }}
    >
      {/* ── header: icon + identity ───────────────────────────── */}
      <div
        className="flex items-stretch"
        style={{
          gap: collapsed ? '0px' : '12px',
          padding: collapsed ? '0px' : '12px',
          transitionProperty: 'gap, padding',
          transitionDuration: collapsed ? DURATION_OUT : DURATION_IN,
          transitionTimingFunction: EASE,
        }}
      >
        <span
          className={`grid size-16 shrink-0 place-items-center overflow-hidden bg-ink-2 ${
            collapsed ? '-m-px rounded-2xl' : 'rounded-xl border border-ink-2/20'
          }`}
          style={{
            transitionProperty: 'border-radius, border-color',
            transitionDuration: collapsed ? DURATION_OUT : DURATION_IN,
            transitionTimingFunction: EASE,
          }}
        >
          <span className="text-dim grid size-full place-items-center">
            <Clapperboard className="size-6" />
          </span>
        </span>

        <div
          className="flex min-w-0 flex-col justify-center overflow-hidden"
          style={{
            width: collapsed ? '0px' : '244px',
            opacity: collapsed ? 0 : 1,
            transform: collapsed ? 'translateX(-10px)' : 'translateX(0px)',
            transitionProperty: 'width, opacity, transform',
            transitionDuration: collapsed ? DURATION_OUT : DURATION_IN,
            transitionTimingFunction: EASE,
            transitionDelay: collapsed ? '0ms' : '90ms',
          }}
        >
          <p className="text-dim truncate font-mono text-[10px] tracking-[0.2em] uppercase">
            {t('datawall.anime.title')}
          </p>
          <p className="text-paper truncate text-sm font-semibold">Bangumi · AniList</p>
          <p className="text-dim mt-0.5 truncate font-mono text-[10px]">
            {bangumi.data?.user?.nickname ?? anilist.data?.name ?? '—'}
          </p>
        </div>
      </div>

      {/* ── body: animated open/close via grid-rows ─────────────── */}
      <div
        className="grid"
        style={{
          gridTemplateRows: collapsed ? '0fr' : '1fr',
          opacity: collapsed ? 0 : 1,
          transitionProperty: 'grid-template-rows, opacity',
          transitionDuration: collapsed ? DURATION_OUT : DURATION_IN,
          transitionTimingFunction: EASE,
          transitionDelay: collapsed ? '0ms' : '120ms',
        }}
      >
        <div className="overflow-hidden">
          <div className="space-y-3 px-3 pb-3">
            <div className="grid grid-cols-2 gap-2.5">
              {bVisible && bStats && (
                <div className="border-ink-2/[0.15] rounded-xl border border-ink-2/20 bg-ink-2/[0.08] p-2.5">
                  <p className="text-dim mb-1.5 font-mono text-[9px] tracking-[0.18em] uppercase">
                    Bangumi
                  </p>
                  <div className="grid grid-cols-2 gap-y-1.5">
                    <MiniStat label={t('datawall.anime.doing')} value={String(bStats.doing)} />
                    <MiniStat label={t('datawall.anime.collect')} value={String(bStats.collect)} />
                    <MiniStat label={t('datawall.anime.wish')} value={String(bStats.wish)} />
                    <MiniStat
                      label={t('datawall.anime.score')}
                      value={bStats.meanScore ? bStats.meanScore.toFixed(1) : '—'}
                    />
                  </div>
                </div>
              )}

              {aVisible && aStats && (
                <div className="border-ink-2/[0.15] rounded-xl border border-ink-2/20 bg-ink-2/[0.08] p-2.5">
                  <p className="text-dim mb-1.5 font-mono text-[9px] tracking-[0.18em] uppercase">
                    AniList
                  </p>
                  <div className="grid grid-cols-2 gap-y-1.5">
                    <MiniStat label={t('datawall.anime.total')} value={String(aStats.count)} />
                    <MiniStat
                      label={t('datawall.anime.score')}
                      value={aStats.meanScore ? (aStats.meanScore / 10).toFixed(1) : '—'}
                    />
                    <MiniStat label={t('datawall.anime.current')} value={String(current)} />
                    <MiniStat
                      label={t('datawall.anime.hours')}
                      value={String(Math.round(aStats.minutesWatched / 60))}
                    />
                  </div>
                </div>
              )}
            </div>

            {bVisible && doing.length > 0 && (
              <div>
                <p className="text-dim mb-1.5 font-mono text-[9px] tracking-[0.18em] uppercase">
                  {t('datawall.anime.watching')}
                </p>
                <ul className="space-y-1">
                  {doing.slice(0, 3).map((c) => (
                    <li key={c.subject.id}>
                      <a
                        href={`https://bgm.tv/subject/${c.subject.id}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="hover:bg-ink-2/10 flex items-center gap-2 rounded-lg p-1 transition-colors duration-200 ease-[var(--ease-out)]"
                      >
                        {c.subject.image && (
                          <img
                            src={c.subject.image}
                            alt=""
                            loading="lazy"
                            onError={hideBrokenImage}
                            className="h-8 w-6 shrink-0 rounded-sm object-cover"
                          />
                        )}
                        <span className="text-paper min-w-0 flex-1 truncate text-[11px]">
                          {c.subject.nameCn || c.subject.name}
                        </span>
                        <span className="text-dim shrink-0 font-mono text-[10px]">
                          EP {c.epStatus}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex items-center justify-end border-t border-ink-2/20 pt-2">
              <button
                onClick={() => {
                  bangumi.refresh()
                  anilist.refresh()
                }}
                disabled={refreshing}
                aria-label={t('datawall.refresh')}
                title={t('datawall.refresh')}
                className="text-dim hover:text-accent disabled:opacity-40 press-sm grid size-6 place-items-center rounded transition-colors"
              >
                <RefreshCw className={`size-3 ${refreshing ? 'animate-spin-slow' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-paper text-xs font-semibold">{value}</p>
      <p className="text-dim font-mono text-[8px] tracking-wider uppercase">{label}</p>
    </div>
  )
}

function hideBrokenImage(event: React.SyntheticEvent<HTMLImageElement>) {
  event.currentTarget.style.display = 'none'
}
