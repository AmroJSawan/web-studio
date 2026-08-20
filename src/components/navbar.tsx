import { motion } from "motion/react"
import type { Device } from "@/hooks/use-device"
import type { ViewportChrome } from "@/hooks/use-viewport-chrome"

export interface NavItem {
  id: string
  label: string
}

interface NavbarProps {
  items: NavItem[]
  active: string
  hidden: boolean
  device: Device
  chrome: ViewportChrome
  glass: boolean
  lightUi: boolean
  onSelect: (id: string) => void
}

/**
 * One navigation, three form factors. The mode is chosen from the device's
 * input capabilities and the space it actually has, not from a user agent
 * string: an inline bar for pointer devices, a thumb-zone dock for phones
 * held upright, and a rail for phones on their side where vertical space is
 * the scarce resource.
 */
export function Navbar({
  items,
  active,
  hidden,
  device,
  chrome,
  glass,
  lightUi,
  onSelect,
}: NavbarProps) {
  const { navMode, touch } = device

  const surface = glass
    ? lightUi
      ? "bg-white/55 backdrop-blur-2xl"
      : "bg-white/10 backdrop-blur-2xl"
    : lightUi
      ? "bg-white"
      : "bg-slate-900"
  const edge = lightUi ? "border-slate-900/10" : "border-white/15"

  const item = (id: string, label: string, vertical: boolean) => {
    const isActive = id === active
    return (
      <li key={id} className="shrink-0">
        <button
          type="button"
          onClick={() => onSelect(id)}
          aria-current={isActive ? "true" : undefined}
          className={`relative rounded-full font-medium whitespace-nowrap transition-colors ${
            vertical ? "w-full px-4 py-2.5 text-left text-[13px]" : ""
          } ${
            !vertical && touch
              ? "min-h-11 px-3 text-[13px] sm:px-5 sm:text-sm"
              : !vertical
                ? "px-4 py-2 text-sm"
                : ""
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
              layoutId="nav-pill"
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              className={`absolute inset-0 rounded-full ${
                lightUi ? "bg-slate-900/10" : "bg-white/15"
              }`}
            />
          )}
          <span className="relative">{label}</span>
        </button>
      </li>
    )
  }

  // Inline bar: lives inside the sticky header, so it needs no chrome of its own.
  if (navMode === "top") {
    return (
      <nav aria-label="Sections">
        <ul className="flex items-center gap-1">
          {items.map((i) => item(i.id, i.label, false))}
        </ul>
      </nav>
    )
  }

  // Rail: hugs the leading edge, clear of a landscape notch.
  if (navMode === "rail") {
    return (
      <motion.nav
        aria-label="Sections"
        initial={false}
        animate={{ x: hidden ? -120 : 0, opacity: hidden ? 0 : 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 34 }}
        style={{
          left: Math.max(chrome.safeLeft, 12),
          maxHeight: chrome.visualHeight - 24,
        }}
        className={`fixed top-1/2 z-50 w-32 -translate-y-1/2 overflow-y-auto rounded-2xl border p-1.5 shadow-2xl shadow-black/40 [scrollbar-width:none] ${edge} ${surface}`}
      >
        <ul className="flex flex-col gap-0.5">
          {items.map((i) => item(i.id, i.label, true))}
        </ul>
      </motion.nav>
    )
  }

  // Dock: thumb zone, lifted over the home indicator and the keyboard.
  return (
    <motion.nav
      aria-label="Sections"
      initial={false}
      animate={{ y: hidden ? 140 : 0, opacity: hidden ? 0 : 1 }}
      transition={{ type: "spring", stiffness: 320, damping: 34 }}
      style={{
        bottom: Math.max(chrome.safeBottom, 0) + (touch ? 20 : 24) + chrome.keyboardInset,
      }}
      className={`fixed left-1/2 z-50 max-w-[calc(100vw-1rem)] -translate-x-1/2 overflow-x-auto overscroll-x-contain rounded-full border p-1.5 shadow-2xl shadow-black/40 [scrollbar-width:none] ${edge} ${surface}`}
    >
      <ul className="flex items-center gap-1">
        {items.map((i) => item(i.id, i.label, false))}
      </ul>
    </motion.nav>
  )
}
