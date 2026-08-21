import { useCallback, useEffect, useRef, useState } from "react"
import { animate, motion, useMotionValue, type PanInfo } from "motion/react"

export interface Reel {
  code: string
  title: string
  body: string
}

interface ReelsFeedProps {
  reels: Reel[]
  colors: [string, string, string, string]
  height: number
  bottomInset: number
  topInset: number
  leftInset: number
  reducedMotion: boolean
  onActiveColorChange: (color: string | null) => void
}

/*
 * Thresholds taken from the two shipping implementations of this gesture
 * rather than invented: Android's ViewPager2 uses a 400 dp/s minimum fling
 * velocity and a 25 dp minimum fling distance, and Swiper treats a swipe
 * under 300 ms as a short swipe that always commits, while a slower one must
 * cross half the slide.
 */
const FLING_VELOCITY = 400
const MIN_FLING_DISTANCE = 25
const LONG_SWIPE_MS = 300
const LONG_SWIPE_RATIO = 0.5
/** A wheel or trackpad burst is treated as one gesture once it goes quiet. */
const WHEEL_IDLE_MS = 90

type Decision = { kind: "flick" | "distance" | "returned"; detail: string } | null

function luminance(hex: string): number {
  const raw = hex.replace("#", "")
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw
  const channel = (i: number) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
}

/** Exposed so the browser-chrome tint can pick a matching colour scheme. */
export const isDarkColor = (hex: string) => luminance(hex) < 0.4

/**
 * A full-screen feed paged by gesture rather than by CSS scroll snap.
 *
 * CSS snapping is positional: it waits for scrolling to stop and then pulls to
 * whichever point is nearest, which is why it can feel like it is correcting
 * you. This reads the gesture instead, the way a native pager does. The track
 * follows the finger one to one, and on release the pace decides:
 *
 * - A quick flick commits to the next slide however short it was, as long as
 *   it cleared the minimum distance. Intent, not travel.
 * - A slow drag commits only once it has passed the halfway mark, and springs
 *   back to where it started if it has not.
 * - The settling spring is handed the release velocity, so the slide carries
 *   on at the speed the finger left it at instead of restarting from nothing.
 *
 * The escapes from the earlier version survive. Wheel gestures at either end
 * are left unhandled so the page scrolls natively, a drag past either end
 * rubber-bands and then hands its travel to the page, and if a slide's content
 * outgrows the screen the whole pager steps aside for an ordinary scroller,
 * since a transform-based pager cannot scroll within a slide.
 */
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
  const frameRef = useRef<HTMLDivElement>(null)
  const contentRefs = useRef<(HTMLElement | null)[]>([])
  const y = useMotionValue(0)
  const [index, setIndex] = useState(0)
  const [decision, setDecision] = useState<Decision>(null)
  const [contentOverflows, setContentOverflows] = useState(false)
  const [inView, setInView] = useState(false)
  const dragStart = useRef(0)
  const lastIndex = reels.length - 1
  const slideColor = (i: number) => colors[i % colors.length]

  const usePager = !contentOverflows && !reducedMotion

  const settle = useCallback(
    (target: number, velocity = 0) => {
      const clamped = Math.max(0, Math.min(target, lastIndex))
      setIndex(clamped)
      animate(y, -clamped * height, {
        type: "spring",
        stiffness: 320,
        damping: 38,
        velocity,
        restDelta: 0.5,
      })
      return clamped
    },
    [height, lastIndex, y],
  )

  // Keep the track aligned when the viewport, and so the slide height, changes.
  useEffect(() => {
    if (usePager) y.set(-index * height)
  }, [height, index, usePager, y])

  useEffect(() => {
    onActiveColorChange(inView ? slideColor(index) : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, index, onActiveColorChange, colors])

  useEffect(() => () => onActiveColorChange(null), [onActiveColorChange])

  useEffect(() => {
    const node = frameRef.current
    if (!node) return
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.intersectionRatio > 0.5),
      { threshold: [0, 0.5, 1] },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  /*
   * A transform pager cannot scroll inside a slide, so if the text outgrows
   * the slide the pager is withdrawn entirely rather than leaving the overflow
   * unreachable. This is the same failure CSS mandatory snapping has, and the
   * condition arrives through ordinary means: 200% zoom, or increased text
   * spacing.
   */
  useEffect(() => {
    const check = () => {
      setContentOverflows(
        contentRefs.current.some(
          (c) => c && c.scrollHeight > height - topInset - bottomInset,
        ),
      )
    }
    check()
    const observer = new ResizeObserver(check)
    contentRefs.current.forEach((c) => c && observer.observe(c))
    return () => observer.disconnect()
  }, [height, topInset, bottomInset, reels.length])

  const commit = useCallback(
    (offset: number, velocity: number, elapsed: number) => {
      const distance = Math.abs(offset)
      const direction = offset < 0 ? 1 : -1
      const quick = elapsed < LONG_SWIPE_MS || Math.abs(velocity) > FLING_VELOCITY

      if (quick && distance > MIN_FLING_DISTANCE) {
        const landed = settle(index + direction, velocity)
        setDecision(
          landed === index
            ? { kind: "returned", detail: "no slide that way" }
            : {
                kind: "flick",
                detail: `${Math.round(Math.abs(velocity))} px/s in ${Math.round(elapsed)} ms`,
              },
        )
        return
      }
      if (distance > height * LONG_SWIPE_RATIO) {
        const landed = settle(index + direction, velocity)
        setDecision(
          landed === index
            ? { kind: "returned", detail: "no slide that way" }
            : {
                kind: "distance",
                detail: `${Math.round((distance / height) * 100)}% of the slide`,
              },
        )
        return
      }
      settle(index, velocity)
      setDecision({
        kind: "returned",
        detail: `${Math.round((distance / height) * 100)}% travelled, under half`,
      })
    },
    [height, index, settle],
  )

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const elapsed = performance.now() - dragStart.current
    const offset = info.offset.y
    const atEdge =
      (index === 0 && offset > 0) || (index === lastIndex && offset < 0)

    // Pulled past either end: give the leftover travel to the page.
    if (atEdge && Math.abs(offset) > MIN_FLING_DISTANCE) {
      settle(index, 0)
      setDecision({ kind: "returned", detail: "end of feed, handed to the page" })
      window.scrollBy({ top: -offset, behavior: reducedMotion ? "auto" : "smooth" })
      return
    }
    commit(offset, info.velocity.y, elapsed)
  }

  // Wheel and trackpad: follow the burst, then judge it like a swipe.
  useEffect(() => {
    const node = frameRef.current
    if (!node || !usePager) return
    let accumulated = 0
    let startedAt = 0
    let timer = 0

    const onWheel = (e: WheelEvent) => {
      const goingDown = e.deltaY > 0
      // At the ends, leave the event alone so the page scrolls natively.
      if ((goingDown && index === lastIndex) || (!goingDown && index === 0)) return
      e.preventDefault()
      if (!startedAt) {
        startedAt = performance.now()
        accumulated = 0
      }
      accumulated -= e.deltaY
      y.set(-index * height + accumulated)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const elapsed = performance.now() - startedAt
        const velocity = (accumulated / Math.max(elapsed, 1)) * 1000
        commit(accumulated, velocity, elapsed)
        startedAt = 0
        accumulated = 0
      }, WHEEL_IDLE_MS)
    }

    node.addEventListener("wheel", onWheel, { passive: false })
    return () => {
      node.removeEventListener("wheel", onWheel)
      window.clearTimeout(timer)
    }
  }, [commit, height, index, lastIndex, usePager, y])

  const onKeyDown = (e: React.KeyboardEvent) => {
    const targets: Record<string, number> = {
      ArrowDown: index + 1,
      PageDown: index + 1,
      ArrowUp: index - 1,
      PageUp: index - 1,
      Home: 0,
      End: lastIndex,
    }
    if (!(e.key in targets)) return
    e.preventDefault()
    if (usePager) settle(targets[e.key])
    else
      frameRef.current
        ?.querySelector(`[data-slide="${Math.max(0, Math.min(targets[e.key], lastIndex))}"]`)
        ?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" })
    setDecision(null)
  }

  const slides = reels.map((reel, i) => {
    const base = slideColor(i)
    const glow = colors[(i + 2) % colors.length]
    const dark = isDarkColor(base)
    const fg = dark ? "text-white" : "text-slate-900"
    const fgDim = dark ? "text-white/70" : "text-slate-700"
    const fgFaint = dark ? "text-white/45" : "text-slate-500"
    return (
      <article
        key={reel.code}
        data-slide={i}
        aria-label={`Slide ${i + 1} of ${reels.length}`}
        className={`relative flex w-full flex-col justify-end ${
          usePager ? "" : "snap-start"
        }`}
        style={{
          height,
          backgroundColor: base,
          paddingTop: topInset,
          paddingBottom: bottomInset,
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(120% 70% at ${i % 2 ? "80%" : "20%"} 42%, ${glow}, transparent 68%)`,
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
          <h3 className={`mt-2 max-w-xl text-3xl font-semibold tracking-tight md:text-4xl ${fg}`}>
            {reel.title}
          </h3>
          <p className={`mt-3 max-w-lg ${fgDim}`}>{reel.body}</p>
          {i === lastIndex && (
            <p className={`mt-6 font-mono text-xs ${fgFaint}`}>
              end of feed · keep scrolling to leave
            </p>
          )}
        </div>
      </article>
    )
  })

  const dark = isDarkColor(slideColor(index))

  return (
    <div className="relative overflow-hidden" style={{ height }}>
      {usePager ? (
        <div
          ref={frameRef}
          tabIndex={0}
          role="group"
          aria-roledescription="feed"
          aria-label="Snap feed"
          onKeyDown={onKeyDown}
          className="h-full overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-inset"
          // Vertical panning is ours; pinch-zoom stays with the browser.
          style={{ touchAction: "pan-x pinch-zoom" }}
        >
          <motion.div
            style={{ y }}
            drag="y"
            dragMomentum={false}
            dragElastic={0.18}
            dragConstraints={{ top: -lastIndex * height, bottom: 0 }}
            onDragStart={() => {
              dragStart.current = performance.now()
            }}
            onDragEnd={onDragEnd}
          >
            {slides}
          </motion.div>
        </div>
      ) : (
        <div
          ref={frameRef}
          tabIndex={0}
          role="group"
          aria-roledescription="feed"
          aria-label="Snap feed"
          onKeyDown={onKeyDown}
          className="h-full overflow-y-auto outline-none [scrollbar-width:none]"
          style={{ scrollSnapType: "y proximity" }}
        >
          {slides}
        </div>
      )}

      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 space-y-1.5 md:right-5"
      >
        {reels.map((reel, i) => (
          <span
            key={reel.code}
            className={`block w-1 rounded-full transition-all duration-300 ${
              i === index ? "h-6" : "h-1.5"
            } ${
              dark
                ? i === index
                  ? "bg-white/85"
                  : "bg-white/35"
                : i === index
                  ? "bg-slate-900/70"
                  : "bg-slate-900/25"
            }`}
          />
        ))}
      </div>

      {/* Makes the rule visible: what the last gesture was read as. */}
      {usePager && decision && (
        <p
          className={`pointer-events-none absolute right-0 left-0 mx-auto max-w-5xl px-6 font-mono text-[11px] ${
            dark ? "text-white/50" : "text-slate-500"
          }`}
          style={{ top: topInset }}
        >
          {decision.kind === "flick" && `flick · ${decision.detail} · advanced`}
          {decision.kind === "distance" && `drag · ${decision.detail} · advanced`}
          {decision.kind === "returned" && `drag · ${decision.detail} · returned`}
        </p>
      )}

      <p aria-live="polite" className="sr-only">
        Slide {index + 1} of {reels.length}: {reels[index]?.title}
      </p>
    </div>
  )
}
