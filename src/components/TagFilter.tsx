import { useEffect, useRef } from 'react'
import { gsap, prefersReducedMotion } from '../lib/gsap'
import { useLang } from '../i18n'

export default function TagFilter({
  tags,
  activeTag,
  onSelect,
}: {
  tags: string[]
  activeTag: string | null
  onSelect: (tag: string | null) => void
}) {
  const { lang } = useLang()
  const tabsRef = useRef<HTMLDivElement>(null)
  const inkRef = useRef<HTMLDivElement>(null)
  const allLabel = lang === 'zh' ? '全部' : 'ALL'

  useEffect(() => {
    const tabs = tabsRef.current
    const ink = inkRef.current
    const active = tabs?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!tabs || !ink || !active) {
      if (ink) gsap.set(ink, { autoAlpha: 0 })
      return
    }
    gsap.to(ink, {
      x: active.offsetLeft,
      y: active.offsetTop + active.offsetHeight - 1,
      width: active.offsetWidth,
      autoAlpha: 1,
      duration: prefersReducedMotion() ? 0 : 0.45,
      ease: 'power3.out',
    })
    if (tabs.scrollWidth > tabs.clientWidth) {
      tabs.scrollTo({ left: Math.max(0, active.offsetLeft - 24), behavior: 'smooth' })
    }
  }, [activeTag, lang])

  return (
    <div className="-mx-4 overflow-x-auto px-4 no-scrollbar" ref={tabsRef}>
      <div className="relative flex gap-1.5 pb-3">
        <div
          ref={inkRef}
          aria-hidden
          className="bg-accent invisible absolute top-0 left-0 h-[2px] w-8"
        />
        <button
          role="tab"
          aria-selected={activeTag === null}
          onClick={() => onSelect(null)}
          className={`inline-flex shrink-0 items-center gap-1.5 border px-2.5 py-1 font-mono text-[11px] tracking-[0.15em] whitespace-nowrap transition-colors ${
            activeTag === null
              ? 'border-line text-accent'
              : 'text-dim hover:text-paper border-transparent'
          }`}
        >
          <span className="size-1.5 rounded-full bg-accent" />
          {allLabel}
        </button>
        {tags.map((tag) => (
          <button
            key={tag}
            role="tab"
            aria-selected={activeTag === tag}
            onClick={() => onSelect(tag)}
            className={`inline-flex shrink-0 items-center gap-1.5 border px-2.5 py-1 font-mono text-[11px] tracking-[0.15em] whitespace-nowrap transition-colors ${
              activeTag === tag
                ? 'border-line text-accent'
                : 'text-dim hover:text-paper border-transparent'
            }`}
          >
            <span
              className={`size-1.5 rounded-full ${
                activeTag === tag ? 'bg-accent' : 'bg-amber dot-breathe'
              }`}
            />
            {tag}
          </button>
        ))}
      </div>
    </div>
  )
}
