import { useRef } from 'react'
import { gsap, useGSAP, SplitText, prefersReducedMotion } from '../lib/gsap'
import { useLang } from '../i18n'
import { type PostDef } from '../data/posts'

export default function PostCard({ post, onSelect }: { post: PostDef; onSelect: () => void }) {
  const { t } = useLang()
  const scope = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      if (prefersReducedMotion()) return
      const split = SplitText.create('[data-card-title]', { type: 'chars', mask: 'chars' })
      gsap.from(split.chars, {
        yPercent: 120,
        duration: 0.8,
        ease: 'power4.out',
        stagger: 0.02,
        scrollTrigger: { trigger: scope.current, start: 'top 88%', once: true },
      })
      gsap.from('[data-card-fade]', {
        y: 20,
        autoAlpha: 0,
        duration: 0.6,
        ease: 'power3.out',
        stagger: 0.08,
        scrollTrigger: { trigger: scope.current, start: 'top 88%', once: true },
      })
      return () => split.revert()
    },
    { scope },
  )

  return (
    <article
      ref={scope}
      className="border-line border-b py-10 transition-all duration-300 ease-[var(--ease-out)] md:py-14 hover:border-accent/30 lift-sm"
    >
      <div className="flex flex-col gap-4 md:flex-row md:gap-8">
        <span
          data-card-fade
          className="font-mono text-[12px] leading-4 tracking-[2px] md:w-12 md:h-[140px] md:px-5 md:pt-1 md:pb-0"
          style={{ color: '#A0A0B0' }}
        >
          {post.index}
        </span>
        <div className="flex-1">
          <div data-card-fade className="flex flex-wrap gap-2 mb-3">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="border-accent/30 text-accent inline-block border px-2 py-0.5 font-mono text-[10px] tracking-[0.15em]"
              >
                {tag}
              </span>
            ))}
          </div>
          <button onClick={onSelect} className="text-left w-full press-md">
            <h2
              data-card-title
              className="text-2xl font-bold tracking-tight transition-colors duration-200 ease-[var(--ease-out)] md:text-3xl hover:text-accent"
            >
              {post.title.zh}
            </h2>
          </button>
          <p data-card-fade className="text-dim mt-3 max-w-2xl text-sm leading-relaxed md:text-base">
            {post.excerpt.zh}
          </p>
          <div
            data-card-fade
            className="mt-4 flex items-center gap-4 font-mono text-[11px] tracking-[0.15em]"
          >
            <span className="text-dim">{post.date}</span>
            <span className="text-accent">·</span>
            <span className="text-dim">{post.readTime}</span>
            <span className="text-accent">·</span>
            <button
              onClick={onSelect}
              className="text-accent hover:text-paper inline-flex items-center gap-1 transition-colors duration-200 ease-[var(--ease-out)] press-sm"
            >
              {t('post.readMore')} <span className="transition-transform duration-200 ease-[var(--ease-out)] group-hover:translate-x-0.5">→</span>
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}
