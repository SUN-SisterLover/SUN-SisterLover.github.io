import type { ReactNode } from 'react'

/**
 * Stacks the floating cards (FloatingPlayer + FloatingSteam) in a single
 * bottom-right anchored flex column. Using `flex-col-reverse` keeps the player
 * pinned to the viewport bottom while the Steam card expands upward, so an
 * expanded card can never overlap its neighbour (no hardcoded offsets needed).
 */
export default function FloatingLayer({ children }: { children: ReactNode }) {
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col-reverse items-end gap-6">
      {children}
    </div>
  )
}
