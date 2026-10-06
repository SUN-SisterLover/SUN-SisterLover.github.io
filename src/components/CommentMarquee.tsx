import { memo, useMemo, useRef } from 'react'
import { gsap, useGSAP, ScrollTrigger, prefersReducedMotion } from '../lib/gsap'
import { SITE_CONFIG } from '../site.config'
import { useComments } from '../lib/comments'

const CommentMarquee = memo(function CommentMarquee() {
  const scope = useRef<HTMLDivElement>(null)

  // Decorative like the hero terminal: it must keep scrolling on a host with no
  // comment service, so `silent` is intentionally not treated as a reason to bail.
  const { comments } = useComments({
    postId: null,
    enabled: SITE_CONFIG.comments.enabled,
    apiBase: SITE_CONFIG.comments.apiBase,
  })

  // Memoised so the band's items keep a stable identity per data change. The
  // scroll tween itself is content-agnostic (`xPercent: -50` on the track), so it
  // is deliberately not rebuilt when the list grows — that would visibly jump.
  const entries = useMemo(
    () => comments.map((c) => ({ id: c.id, author: c.author, text: c.text })),
    [comments],
  )

  useGSAP(
    () => {
      if (prefersReducedMotion()) return
      const track = scope.current?.querySelector<HTMLElement>('[data-marquee-track]')
      const tween = gsap.to('[data-marquee-track]', {
        xPercent: -50,
        duration: 36,
        ease: 'none',
        repeat: -1,
      })
      const proxy = { speed: 1, skew: 0 }
      const skewSetter = track ? gsap.quickSetter(track, 'skewX', 'deg') : () => {}
      ScrollTrigger.create({
        onUpdate: (self) => {
          const velocity = self.getVelocity()
          const speed = gsap.utils.clamp(1, 5, 1 + Math.abs(velocity) / 350)
          const skew = gsap.utils.clamp(-9, 9, velocity / -250)
          if (speed > proxy.speed || Math.abs(skew) > Math.abs(proxy.skew)) {
            proxy.speed = Math.max(speed, proxy.speed)
            proxy.skew = Math.abs(skew) > Math.abs(proxy.skew) ? skew : proxy.skew
            tween.timeScale(proxy.speed)
            skewSetter(proxy.skew)
            gsap.to(proxy, {
              speed: 1,
              skew: 0,
              duration: 1.4,
              ease: 'power3.out',
              overwrite: true,
              onUpdate: () => {
                tween.timeScale(proxy.speed)
                skewSetter(proxy.skew)
              },
            })
          }
        },
      })
    },
    { scope },
  )

  if (entries.length === 0) return null

  const Sequence = () => (
    <>
      {entries.map((entry) => (
        <span key={entry.id} className="mx-7 inline-flex items-center gap-3 whitespace-nowrap">
          <span className="bg-night/40 inline-block size-1.5 rounded-full" />
          <span className="text-night/70 font-normal">{entry.author}</span>
          <span>{entry.text}</span>
        </span>
      ))}
    </>
  )

  return (
    <div ref={scope} aria-hidden className="pointer-events-none relative z-10 -my-4 overflow-hidden">
      <div className="bg-gradient-accent text-night overflow-hidden py-2.5">
        <div
          data-marquee-track
          className="flex w-max font-mono text-xs font-bold tracking-[0.2em] uppercase"
        >
          <Sequence />
          <Sequence />
        </div>
      </div>
    </div>
  )
})

export default CommentMarquee
