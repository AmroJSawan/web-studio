import { motion } from "motion/react"
import type { ViewportChrome } from "@/hooks/use-viewport-chrome"

export interface DockItem {
  id: string
  label: string
}

interface FloatingDockProps {
  items: DockItem[]
  active: string
  hidden: boolean
  chrome: ViewportChrome
  coarse: boolean
  glass: boolean
  lightUi: boolean
  onSelect: (id: string) => void
}

export function FloatingDock({
  items,
  active,
  hidden,
  chrome,
  coarse,
  glass,
  lightUi,
  onSelect,
}: FloatingDockProps) {
  /*
   * The dock rides above whatever the browser puts at the bottom of the
   * screen: the home indicator, the collapsing toolbar, and the on-screen
   * keyboard. `keyboardInset` is zero until an input takes focus.
   */
  const bottom = Math.max(chrome.safeBottom, 0) + (coarse ? 20 : 24) + chrome.keyboardInset

  return (
    <motion.nav
      aria-label="Sections"
      initial={false}
      animate={{ y: hidden ? 140 : 0, opacity: hidden ? 0 : 1 }}
      transition={{ type: "spring", stiffness: 320, damping: 34 }}
      style={{ bottom }}
      className={`fixed left-1/2 z-50 max-w-[calc(100vw-1rem)] -translate-x-1/2 overflow-x-auto overscroll-x-contain rounded-full border p-1.5 shadow-2xl shadow-black/40 [scrollbar-width:none] ${
        lightUi ? "border-slate-900/10" : "border-white/15"
      } ${
        glass
          ? lightUi
            ? "bg-white/55 backdrop-blur-2xl"
            : "bg-white/10 backdrop-blur-2xl"
          : lightUi
            ? "bg-white"
            : "bg-slate-900"
      }`}
    >
      <ul className="flex items-center gap-1">
        {items.map((item) => {
          const isActive = item.id === active
          return (
            <li key={item.id} className="shrink-0">
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                aria-current={isActive ? "true" : undefined}
                className={`relative rounded-full font-medium whitespace-nowrap transition-colors ${
                  coarse
                    ? "min-h-11 px-3 text-[13px] sm:px-5 sm:text-sm"
                    : "px-4 py-2 text-sm"
                } ${
                  isActive
                    ? lightUi
                      ? "text-slate-900"
                      : "text-white"
                    : lightUi
                      ? "text-slate-500 hover:text-slate-900"
                      : "text-white/55 hover:text-white"
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="dock-pill"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    className={`absolute inset-0 rounded-full ${
                      lightUi ? "bg-slate-900/10" : "bg-white/15"
                    }`}
                  />
                )}
                <span className="relative">{item.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </motion.nav>
  )
}
