import { useRef } from 'react'
import { gsap, useGSAP, prefersReducedMotion } from '../lib/gsap'
import { formatInteger } from '../lib/bilibili'

/**
 * A number that counts up to `value` once it is known.
 *
 * The hero's other counters animate from a `[data-count]` sweep that runs once at
 * mount, so a value that arrives later — as the visit counters do — would land
 * after that sweep and never animate. This component owns its own tween instead.
 */
export default function AnimatedCount({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null)

  useGSAP(
    () => {
      const el = ref.current
      if (!el) return

      if (prefersReducedMotion()) {
        el.textContent = formatInteger(value)
        return
      }

      const counter = { v: 0 }
      gsap.to(counter, {
        v: value,
        duration: 1.4,
        ease: 'power2.out',
        onUpdate: () => {
          el.textContent = formatInteger(counter.v)
        },
        onComplete: () => {
          el.textContent = formatInteger(value)
        },
      })
    },
    { dependencies: [value], scope: ref },
  )

  return <span ref={ref}>{formatInteger(value)}</span>
}
