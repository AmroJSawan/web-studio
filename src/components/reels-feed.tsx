import { useCallback, useEffect, useRef, useState } from "react"

export interface Reel {
  code: string
  title: string
  body: string
}

interface ReelsFeedProps {
  reels: Reel[]
  colors: [string, string, string, string]
  /** Explicit pixel height for the viewport and every slide. */
  height: number
  /** Space at the bottom of a slide reserved for the floating dock. */
  bottomInset: number
  topInset: number
  /** Cleared when the landscape rail occupies the leading edge. */
  leftInset: number
  reducedMotion: boolean
  onActiveColorChange: (color: string | null) => void
}

/** Relative luminance, so slide text can be chosen rather than scrimmed. */
function luminance(hex: string): number {
  const raw = hex.replace("#", "")
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw
  const channel = (i: number) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
}

/**
 * A full-screen vertical snap feed, tuned for the web rather than for an app.
 *
 * The snapping itself is ordinary CSS. What the web needs on top of it is a
 * set of escapes, because unlike a native feed this one is a passage inside a
 * document the reader still has to get out of:
 *
 * - Scroll containment is released at the ends. Mid-feed the gesture is
 *   contained, so a hard flick cannot jolt the page underneath and
 *   pull-to-refresh stays suppressed; on the first and last slide it reverts
 *   to `auto` so the next gesture chains out and the reader simply leaves.
 * - Snapping drops from `mandatory` to `proximity` whenever a slide's content
 *   grows taller than the slide, which is what happens at 200% zoom or with
 *   increased text spacing. Mandatory snapping would pin such a slide to the
 *   top and put its last line permanently out of reach.
 * - Reduced-motion readers get `proximity` and instant jumps.
 * - The feed is keyboard operable, reports its position to assistive
 *   technology, and never traps Tab.
 * - Every slide stays in the DOM, so find-in-page still finds them.
 */
/** Exposed so the browser-chrome tint can pick a matching colour scheme. */
export const isDarkColor = (hex: string) => luminance(hex) < 0.4

export function ReelsFeed({
  reels,
  colors,
  height,
  bottomInset,
  topInset,
  leftInset,
  reducedMotion,
  onActiveColorChange,
}: ReelsFeedProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const slideRefs = useRef<(HTMLElement | null)[]>([])
  const contentRefs = useRef<(HTMLElement | null)[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)
  const [contentOverflows, setContentOverflows] = useState(false)
  const [inView, setInView] = useState(false)

  const slideColor = (i: number) => colors[i % colors.length]

  // Which slide is showing, for the rail, the status line and the browser tint.
  useEffect(() => {
    const root = viewportRef.current
    if (!root) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (!visible) return
        const index = slideRefs.current.indexOf(visible.target as HTMLElement)
        if (index >= 0) setActiveIndex(index)
      },
      { root, threshold: [0.25, 0.6, 0.9] },
    )
    slideRefs.current.forEach((n) => n && observer.observe(n))
    return () => observer.disconnect()
  }, [reels.length])

  // The browser chrome only follows the feed while the feed is on screen.
  useEffect(() => {
    const root = viewportRef.current
    if (!root) return
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.intersectionRatio > 0.5),
      { threshold: [0, 0.5, 1] },
    )
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    onActiveColorChange(inView ? slideColor(activeIndex) : null)
  }, [inView, activeIndex, onActiveColorChange, colors])

  useEffect(() => () => onActiveColorChange(null), [onActiveColorChange])

  // Release containment at the ends so the reader can scroll out of the feed.
  useEffect(() => {
    const root = viewportRef.current
    if (!root) return
    let frame = 0
    const read = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        setAtStart(root.scrollTop <= 2)
        setAtEnd(root.scrollTop >= root.scrollHeight - root.clientHeight - 2)
      })
    }
    read()
    root.addEventListener("scroll", read, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      root.removeEventListener("scroll", read)
    }
  }, [height, reels.length])

  /*
   * Mandatory snapping pins a slide to the top of the scroller. If the slide's
   * content is taller than the slide, its foot becomes unreachable, which is
   * the scroll-snap accessibility failure WCAG 1.4.4 and 1.4.10 care about.
   */
  useEffect(() => {
    const check = () => {
      const overflows = contentRefs.current.some(
        (c) => c && c.scrollHeight > height - topInset - bottomInset,
      )
      setContentOverflows(overflows)
    }
    check()
    const observer = new ResizeObserver(check)
    contentRefs.current.forEach((c) => c && observer.observe(c))
    return () => observer.disconnect()
  }, [height, topInset, bottomInset, reels.length])

  const goTo = useCallback(
    (index: number) => {
      const root = viewportRef.current
      if (!root) return
      const clamped = Math.max(0, Math.min(index, reels.length - 1))
      root.scrollTo({
        top: clamped * height,
        behavior: reducedMotion ? "auto" : "smooth",
      })
    },
    [height, reels.length, reducedMotion],
  )

  const onKeyDown = (e: React.KeyboardEvent) => {
    const keys: Record<string, number> = {
      ArrowDown: activeIndex + 1,
      PageDown: activeIndex + 1,
      ArrowUp: activeIndex - 1,
      PageUp: activeIndex - 1,
      Home: 0,
      End: reels.length - 1,
    }
    if (e.key in keys) {
      e.preventDefault()
      goTo(keys[e.key])
    }
  }

  const snapMode = contentOverflows || reducedMotion ? "proximity" : "mandatory"
  const contained = !atStart && !atEnd

  return (
    <div className="relative" style={{ height }}>
      <div
        ref={viewportRef}
        tabIndex={0}
        role="group"
        aria-roledescription="feed"
        aria-label="Snap feed"
        onKeyDown={onKeyDown}
        className="h-full overflow-y-auto outline-none [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-inset"
        style={{
          scrollSnapType: `y ${snapMode}`,
          overscrollBehaviorY: contained ? "contain" : "auto",
        }}
      >
        {reels.map((reel, i) => {
          const base = slideColor(i)
          const glow = colors[(i + 2) % colors.length]
          const dark = isDarkColor(base)
          const fg = dark ? "text-white" : "text-slate-900"
          const fgDim = dark ? "text-white/70" : "text-slate-700"
          const fgFaint = dark ? "text-white/45" : "text-slate-500"
          return (
            <article
              key={reel.code}
              ref={(n) => {
                slideRefs.current[i] = n
              }}
              aria-label={`Slide ${i + 1} of ${reels.length}`}
              className="relative flex snap-start snap-always flex-col justify-end"
              style={{
                height,
                // A single base colour at both edges, so the browser chrome
                // above and below meets the same tone with no seam.
                backgroundColor: base,
                paddingTop: topInset,
                paddingBottom: bottomInset,
              }}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  background: `radial-gradient(120% 70% at ${
                    i % 2 ? "80%" : "20%"
                  } 42%, ${glow}, transparent 68%)`,
                  opacity: 0.75,
                }}
              />
              <div
                ref={(n) => {
                  contentRefs.current[i] = n
                }}
                className="relative mx-auto w-full max-w-5xl px-6"
                style={leftInset ? { paddingLeft: leftInset } : undefined}
              >
                <p className={`font-mono text-xs tracking-widest ${fgFaint}`}>
                  {String(i + 1).padStart(2, "0")} / {String(reels.length).padStart(2, "0")}
                </p>
                <p className={`mt-3 font-mono text-sm ${fgDim}`}>{reel.code}</p>
                <h3
                  className={`mt-2 max-w-xl text-3xl font-semibold tracking-tight md:text-4xl ${fg}`}
                >
                  {reel.title}
                </h3>
                <p className={`mt-3 max-w-lg ${fgDim}`}>{reel.body}</p>
                {i === reels.length - 1 && (
                  <p className={`mt-6 font-mono text-xs ${fgFaint}`}>
                    end of feed · keep scrolling to leave
                  </p>
                )}
              </div>
            </article>
          )
        })}
      </div>

      {/* Position rail, outside the scroller so it never snaps with it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 space-y-1.5 md:right-5"
      >
        {reels.map((reel, i) => {
          const dark = isDarkColor(slideColor(activeIndex))
          return (
            <span
              key={reel.code}
              className={`block w-1 rounded-full transition-all duration-300 ${
                i === activeIndex ? "h-6" : "h-1.5"
              } ${
                dark
                  ? i === activeIndex
                    ? "bg-white/85"
                    : "bg-white/35"
                  : i === activeIndex
                    ? "bg-slate-900/70"
                    : "bg-slate-900/25"
              }`}
            />
          )
        })}
      </div>

      <p aria-live="polite" className="sr-only">
        Slide {activeIndex + 1} of {reels.length}: {reels[activeIndex]?.title}
      </p>
    </div>
  )
}
