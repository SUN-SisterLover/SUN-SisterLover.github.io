import { useRef } from 'react'
import { gsap, useGSAP, SplitText, prefersReducedMotion, hasFinePointer } from '../lib/gsap'
import { useLang } from '../i18n'
import { POSTS } from '../data/posts'
import { SITE_CONFIG } from '../site.config'
import { useStats } from '../lib/stats'
import AnimatedCount from './AnimatedCount'
import CommentTerminal from './CommentTerminal'

export default function Hero() {
  const { t } = useLang()
  const scope = useRef<HTMLElement>(null)
  const { brand, hero: heroCfg } = SITE_CONFIG

  const stats = useStats({ enabled: SITE_CONFIG.stats.enabled, apiBase: SITE_CONFIG.stats.apiBase })

  // Stays null while loading, and stays null on hosts without a visit counter, so
  // the two cells simply do not render rather than showing a placeholder.
  const views = heroCfg.showViews ? stats.data : null

  const pad = (n: number) => String(n).padStart(2, '0')
  const allTags = [...new Set(POSTS.flatMap((p) => p.tags))]

  useGSAP(
    (_, contextSafe) => {
      if (prefersReducedMotion()) return
      const split = SplitText.create('[data-hero-title]', { type: 'chars', mask: 'chars' })
      gsap
        .timeline({ defaults: { ease: 'power4.out' } })
        .from(split.chars, { yPercent: 120, duration: 1, stagger: 0.04 })
        .from(
          '[data-hero-badge]',
          { scale: 0, rotation: -14, duration: 0.6, ease: 'back.out(1.7)' },
          '-=0.55',
        )
        .from('[data-hero-fade]', { y: 24, autoAlpha: 0, duration: 0.7, stagger: 0.1 }, '-=0.35')

      gsap.utils.toArray<HTMLElement>('[data-count]').forEach((el) => {
        const end = Number(el.dataset.count)
        const obj = { v: 0 }
        gsap.to(obj, {
          v: end,
          duration: 1.4,
          delay: 0.8,
          ease: 'power2.out',
          onUpdate: () => {
            el.textContent = String(Math.round(obj.v)).padStart(2, '0')
          },
        })
      })

      if (heroCfg.showParallax && hasFinePointer() && contextSafe) {
        const xTo = gsap.quickTo('[data-hero-parallax]', 'x', { duration: 0.9, ease: 'power3' })
        const yTo = gsap.quickTo('[data-hero-parallax]', 'y', { duration: 0.9, ease: 'power3' })
        const onMove = contextSafe((e: PointerEvent) => {
          xTo((e.clientX / window.innerWidth - 0.5) * 26)
          yTo((e.clientY / window.innerHeight - 0.5) * 14)
        })
        window.addEventListener('pointermove', onMove)
        return () => {
          window.removeEventListener('pointermove', onMove)
          split.revert()
        }
      }
      return () => split.revert()
    },
    { scope },
  )

  return (
    <section ref={scope} id="top" className="relative overflow-hidden">
      <div className="mx-auto w-full max-w-7xl px-4 pt-28 pb-16 md:pt-44 md:pb-28">
        <p
          data-hero-fade
          className="text-dim font-mono text-xs tracking-[0.2em] uppercase md:tracking-[0.35em]"
        >
          {t('hero.kicker')}
        </p>

        <h1 data-hero-parallax className="mt-8 leading-[0.92] font-bold tracking-tight uppercase">
          <span data-hero-title className="block text-[clamp(4rem,14vw,10.5rem)]">
            {brand.titleWord1}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-7 gap-y-5">
            <span data-hero-title className="text-outline block text-[clamp(4rem,14vw,10.5rem)]">
              {brand.titleWord2}
            </span>
            {heroCfg.showBadge && (
            <span
              data-hero-badge
              className="bg-gradient-accent text-ink inline-block -rotate-3 px-3.5 py-2 font-mono text-[10px] font-bold tracking-[0.15em] whitespace-nowrap normal-case shadow-lg shadow-accent/10 md:text-xs"
            >
              {t('hero.badge')}
            </span>
            )}
          </span>
        </h1>

        <p data-hero-fade className="text-dim mt-8 max-w-xl text-base leading-relaxed md:text-lg">
          {t('hero.sub')}
        </p>

        {/*
          Deliberately not part of the stats row below: the oversized title and the
          comments terminal push that row past the fold, so these counters would only
          be seen by a visitor who scrolled.
        */}
        {views && (
          <div
            data-hero-views
            className="border-line bg-ink/80 mt-10 inline-flex flex-wrap items-baseline gap-x-3 gap-y-3 border px-5 py-3.5 backdrop-blur-sm"
          >
            <span className="text-dim font-mono text-[11px] tracking-[0.25em] uppercase">
              {t('meta.views')}
            </span>
            <span className="text-paper text-2xl tracking-normal md:text-3xl">
              <AnimatedCount value={views.total} />
            </span>
            <span aria-hidden className="text-dim select-none">
              ·
            </span>
            <span className="text-dim font-mono text-[11px] tracking-[0.25em] uppercase">
              {t('meta.today')}
            </span>
            <span className="text-paper text-2xl tracking-normal md:text-3xl">
              <AnimatedCount value={views.today} />
            </span>
          </div>
        )}

        <div data-hero-fade className="mt-10">
          <CommentTerminal />
        </div>

        {heroCfg.showStats && (
          <dl
            data-hero-fade
            className="border-line text-dim mt-10 flex flex-wrap gap-x-8 gap-y-5 border-t pt-6 font-mono text-[11px] tracking-[0.25em] uppercase md:mt-12 md:gap-x-14"
          >
            <div>
              <dt>{t('meta.posts')}</dt>
              <dd className="text-paper mt-1 text-2xl tracking-normal md:text-3xl">
                <span data-count={POSTS.length}>{pad(POSTS.length)}</span>
              </dd>
            </div>
            <div>
              <dt>{t('meta.tags')}</dt>
              <dd className="text-paper mt-1 text-2xl tracking-normal md:text-3xl">
                <span data-count={allTags.length}>{pad(allTags.length)}</span>
              </dd>
            </div>
            {heroCfg.showUpdated && (
              <div>
                <dt>{t('meta.updated')}</dt>
                <dd className="text-paper mt-1 text-2xl tracking-normal md:text-3xl">
                  {new Date().toISOString().slice(0, 7).replace('-', '.')}
                </dd>
              </div>
            )}
          </dl>
        )}
      </div>
    </section>
  )
}
