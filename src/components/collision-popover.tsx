import { useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion } from "motion/react"

interface CollisionPopoverProps {
  label: string
  children: ReactNode
  glass: boolean
  lightUi: boolean
}

type Placement = "top" | "bottom"

const GAP = 10
const EDGE = 12

/**
 * A floating panel that measures the space left in the visual viewport and
 * flips or shifts itself to stay fully on screen. Recomputed on every scroll
 * and resize while open, because the available space changes as the browser
 * toolbar collapses.
 */
export function CollisionPopover({
  label,
  children,
  glass,
  lightUi,
}: CollisionPopoverProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState<Placement>("bottom")
  const [shift, setShift] = useState(0)
  const [left, setLeft] = useState(0)

  useLayoutEffect(() => {
    if (!open) return
    const reposition = () => {
      const wrapper = wrapperRef.current
      const trigger = triggerRef.current
      const panel = panelRef.current
      if (!wrapper || !trigger || !panel) return

      const vv = window.visualViewport
      const viewTop = vv?.offsetTop ?? 0
      const viewHeight = vv?.height ?? window.innerHeight
      const viewWidth = vv?.width ?? window.innerWidth
      const anchor = trigger.getBoundingClientRect()
      const size = panel.getBoundingClientRect()

      const spaceBelow = viewTop + viewHeight - anchor.bottom
      const spaceAbove = anchor.top - viewTop
      const next: Placement =
        spaceBelow < size.height + GAP + EDGE && spaceAbove > spaceBelow
          ? "top"
          : "bottom"

      /*
       * Positioned with `left` rather than a translateX, because Motion owns
       * the element's transform for the open animation and would overwrite
       * any centering we put there.
       */
      const centered = anchor.left + anchor.width / 2 - size.width / 2
      const clamped = Math.min(
        Math.max(centered, EDGE),
        Math.max(EDGE, viewWidth - size.width - EDGE),
      )

      setPlacement(next)
      setShift(Math.round(clamped - centered))
      setLeft(clamped - wrapper.getBoundingClientRect().left)
    }

    reposition()
    const vv = window.visualViewport
    window.addEventListener("scroll", reposition, { passive: true })
    window.addEventListener("resize", reposition)
    vv?.addEventListener("resize", reposition)
    vv?.addEventListener("scroll", reposition)
    return () => {
      window.removeEventListener("scroll", reposition)
      window.removeEventListener("resize", reposition)
      vv?.removeEventListener("resize", reposition)
      vv?.removeEventListener("scroll", reposition)
    }
  }, [open])

  const surface = glass
    ? lightUi
      ? "bg-white/70 backdrop-blur-2xl"
      : "bg-slate-950/70 backdrop-blur-2xl"
    : lightUi
      ? "bg-white"
      : "bg-slate-900"

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`min-h-11 rounded-full border px-5 text-sm font-medium transition-colors ${
          lightUi
            ? "border-slate-900/15 text-slate-900 hover:bg-slate-900/5"
            : "border-white/20 text-white hover:bg-white/10"
        }`}
      >
        {label}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: placement === "bottom" ? -6 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: placement === "bottom" ? -6 : 6 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            style={{
              left,
              [placement === "bottom" ? "top" : "bottom"]: `calc(100% + ${GAP}px)`,
            }}
            className={`absolute z-40 w-64 rounded-2xl border p-4 text-sm shadow-2xl shadow-black/40 ${
              lightUi ? "border-slate-900/10 text-slate-700" : "border-white/15 text-white/75"
            } ${surface}`}
          >
            <p
              className={`mb-2 font-mono text-xs tracking-wide ${
                lightUi ? "text-slate-500" : "text-white/45"
              }`}
            >
              placement: {placement}
              {shift !== 0 && ` · shift ${Math.round(shift)}px`}
            </p>
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
