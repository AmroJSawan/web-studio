import { useEffect, useRef, useState } from "react"

export interface Reel {
  code: string
  title: string
  body: string
}

interface ReelsFeedProps {
  reels: Reel[]
  /** Palette the surrounding scene is using, so the feed stays in key. */
  colors: [string, string, string, string]
  /** Explicit pixel height for the viewport and every slide. */
  height: number
  reducedMotion: boolean
  lightUi: boolean
  glass: boolean
}

/**
 * A vertical snap feed in the shape of a reels player.
 *
 * The snapping is pure CSS. Three details make it feel native rather than
 * merely functional:
 *
 * - `scroll-snap-type: y mandatory` never lets the scroll rest between items.
 * - `scroll-snap-stop: always` makes one flick travel exactly one slide, so a
 *   hard fling cannot skip three of them.
 * - `overscroll-behavior-y: contain` stops the gesture chaining out to the
 *   page once the feed hits its end, and suppresses pull-to-refresh.
 *
 * The snap container is a nested element and never the document: putting
 * `scroll-snap-type` on `html` or `body` has a long history of breaking
 * scrolling outright in iOS Safari. Heights are explicit pixels measured from
 * the visual viewport rather than percentages or `100vh`, which sidesteps both
 * the iOS toolbar gap and older WebKit ignoring percentage-sized snap children.
 */
export function ReelsFeed({
  reels,
  colors,
  height,
  reducedMotion,
  lightUi,
  glass,
}: ReelsFeedProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const slideRefs = useRef<(HTMLElement | null)[]>([])
  const [activeIndex, setActiveIndex] = useState(0)

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
    slideRefs.current.forEach((node) => node && observer.observe(node))
    return () => observer.disconnect()
  }, [reels.length])

  const goTo = (index: number) => {
    const root = viewportRef.current
    if (!root) return
    root.scrollTo({
      top: index * height,
      behavior: reducedMotion ? "auto" : "smooth",
    })
  }

  const frame = lightUi ? "border-slate-900/15" : "border-white/15"

  return (
    <div className="flex items-start justify-center gap-4">
      <div
        className={`relative overflow-hidden rounded-[2rem] border shadow-2xl shadow-black/40 ${frame}`}
        style={{ width: 300 }}
      >
        <div
          ref={viewportRef}
          tabIndex={0}
          role="region"
          aria-label="Snap feed"
          className="snap-y snap-mandatory overflow-y-auto overscroll-y-contain outline-none [scrollbar-width:none]"
          style={{ height }}
        >
          {reels.map((reel, i) => (
            <article
              key={reel.code}
              ref={(node) => {
                slideRefs.current[i] = node
              }}
              aria-label={`${i + 1} of ${reels.length}: ${reel.title}`}
              className="relative flex snap-start snap-always flex-col justify-end overflow-hidden p-5"
              style={{
                height,
                background: `linear-gradient(${150 + i * 40}deg, ${colors[i % colors.length]}, ${
                  colors[(i + 2) % colors.length]
                })`,
              }}
            >
              <span
                aria-hidden
                className="absolute inset-x-0 bottom-0 h-2/3"
                style={{
                  background:
                    "linear-gradient(to top, rgba(0,0,0,0.72), transparent)",
                }}
              />
              <p className="relative font-mono text-[11px] tracking-widest text-white/70">
                {String(i + 1).padStart(2, "0")} / {String(reels.length).padStart(2, "0")}
              </p>
              <h3 className="relative mt-1 font-mono text-[13px] text-white">
                {reel.code}
              </h3>
              <p className="relative mt-2 text-sm font-semibold text-white">
                {reel.title}
              </p>
              <p className="relative mt-1 text-[13px] leading-snug text-white/75">
                {reel.body}
              </p>
            </article>
          ))}
        </div>

        {/* Position rail, outside the scroller so it never snaps with it. */}
        <div className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 space-y-1.5">
          {reels.map((reel, i) => (
            <span
              key={reel.code}
              className={`block w-1 rounded-full transition-all duration-300 ${
                i === activeIndex ? "h-5 bg-white/85" : "h-1.5 bg-white/35"
              }`}
            />
          ))}
        </div>
      </div>

      <ol
        className={`hidden w-44 space-y-1 font-mono text-[12px] sm:block ${
          lightUi ? "text-slate-500" : "text-white/45"
        }`}
      >
        {reels.map((reel, i) => (
          <li key={reel.code}>
            <button
              type="button"
              onClick={() => goTo(i)}
              className={`w-full rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                i === activeIndex
                  ? lightUi
                    ? "bg-slate-900/10 text-slate-900"
                    : `${glass ? "bg-white/15" : "bg-white/10"} text-white`
                  : lightUi
                    ? "hover:text-slate-900"
                    : "hover:text-white"
              }`}
            >
              {String(i + 1).padStart(2, "0")} · {reel.code}
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
