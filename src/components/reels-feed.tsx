import { useCallback, useEffect, useRef, useState } from "react"
import { animate, motion, useMotionValue } from "motion/react"

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
  /** Which viewport edge the browser draws its bar against. */
  tintEdge: "top" | "bottom"
  onActiveColorChange: (color: string | null) => void
}

/*
 * Calibration. Where a platform publishes a number, it is used as published;
 * where one does not exist, it is marked as tuned.
 *
 * Android reports its thresholds in dp. On a mobile browser the device pixel
 * ratio is the display density, so one CSS pixel covers one dp and the values
 * carry across without conversion.
 */

/** ViewPager2 MIN_FLING_VELOCITY: above this a release reads as a throw. */
const FLING_VELOCITY = 400
/** ViewPager2 MIN_DISTANCE_FOR_FLING: keeps a twitch from counting as one. */
const MIN_FLING_DISTANCE = 25
/** ViewConfiguration getScaledMaximumFlingVelocity, so one bad sample cannot bolt. */
const MAX_FLING_VELOCITY = 8000
/**
 * Wheel deltas are coarser than a finger and the touch number would page on an
 * ordinary trackpad drag. Tuned, with no platform equivalent to borrow.
 */
const WHEEL_FLING_VELOCITY = 900
/** A finger resting this long before lifting is placing the feed, not throwing it. */
const HOLD_MS = 120
/**
 * Velocity is measured across the last moments of the gesture, the way
 * Android's VelocityTracker does, not across the whole drag. A long slow drag
 * that ends in a flick is a flick, and one that ends at rest is a placement.
 */
const VELOCITY_WINDOW_MS = 100
/**
 * UIScrollView's normal deceleration rate, 0.2% of velocity shed per
 * millisecond. Apple's projection from WWDC18's Designing Fluid Interfaces
 * turns a release velocity into the point momentum would actually reach:
 * (v / 1000) * rate / (1 - rate), which at 0.998 is v * 0.499 seconds.
 */
const DECELERATION_RATE = 0.998
/** UIScrollView's rubber band constant. */
const RUBBER_BAND_C = 0.55
/** Movement before the gesture commits to an axis. */
const DIRECTION_LOCK_PX = 6
/** Imperceptible cleanup so a free rest does not sit a few pixels off true. */
const EDGE_TOLERANCE = 6
/** A wheel or trackpad burst is treated as one gesture once it goes quiet. */
const WHEEL_IDLE_MS = 90

/** Apple's projection: where this velocity would come to rest on its own. */
const project = (velocity: number) =>
  (velocity / 1000) * (DECELERATION_RATE / (1 - DECELERATION_RATE))

/**
 * Apple's rubber band curve, f(x) = (x * d * c) / (d + c * |x|). Resistance
 * grows with distance instead of scaling linearly, so the edge feels like it
 * is pushing back rather than simply moving less.
 */
const rubberBand = (overshoot: number, dimension: number) =>
  (overshoot * dimension * RUBBER_BAND_C) /
  (dimension + RUBBER_BAND_C * Math.abs(overshoot))

type Decision = { kind: "paged" | "free"; detail: string } | null

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
 * A full-screen feed whose snapping switches itself on and off by reading how
 * the gesture was made.
 *
 * CSS scroll snap is positional: it waits for scrolling to stop and pulls to
 * whichever point is nearest, whatever the reader was doing. That is the part
 * that feels like a hijack, because placing the feed somewhere deliberately
 * and throwing it to scan are answered identically.
 *
 * Here the release decides which of the two it was, and only one of them
 * involves snapping at all:
 *
 * - Thrown quickly, the gesture reads as scanning, so paging engages and the
 *   feed lands on the next slide, its spring seeded with the release velocity
 *   so the movement carries on at the speed the finger left at.
 * - Dragged slowly, or held still before lifting, the gesture reads as
 *   placing, so paging stays off and the feed keeps exactly the position it
 *   was given, carrying only the momentum that was really in it.
 *
 * Nothing is ever pulled back to where it started. A partial scroll is a
 * position, not a failed page turn, and the feed may rest between slides for
 * as long as the reader wants it there.
 */
export function ReelsFeed({
  reels,
  colors,
  height,
  bottomInset,
  topInset,
  leftInset,
  reducedMotion,
  tintEdge,
  onActiveColorChange,
}: ReelsFeedProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const contentRefs = useRef<(HTMLElement | null)[]>([])
  const y = useMotionValue(0)
  const [index, setIndex] = useState(0)
  const [edgeIndex, setEdgeIndex] = useState(0)
  const [decision, setDecision] = useState<Decision>(null)
  const [contentOverflows, setContentOverflows] = useState(false)
  const [inView, setInView] = useState(false)
  const lastIndex = reels.length - 1
  const slideColor = (i: number) => colors[i % colors.length]

  const usePager = !contentOverflows && !reducedMotion

  const bounds = { min: -lastIndex * height, max: 0 }
  const clampY = (v: number) => Math.max(bounds.min, Math.min(bounds.max, v))
  const running = useRef<{ stop: () => void } | null>(null)
  const stopSettle = () => {
    running.current?.stop()
    running.current = null
  }

  /** Paging: land on a slide boundary, carrying the release velocity in. */
  const pageTo = useCallback(
    (target: number, velocity = 0) => {
      const clamped = Math.max(0, Math.min(target, lastIndex))
      stopSettle()
      running.current = animate(y, -clamped * height, {
        type: "spring",
        visualDuration: 0.42,
        bounce: 0.06,
        velocity,
      })
      return clamped
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [height, lastIndex, y],
  )

  /**
   * Free settle: no snapping. The feed keeps the position it was handed and
   * runs out whatever momentum was actually in the gesture, landing where
   * Apple's projection says that velocity would have come to rest.
   */
  const glideTo = useCallback(
    (velocity: number) => {
      const current = y.get()
      const outOfBounds = current > bounds.max || current < bounds.min
      let target = clampY(current + project(velocity))
      const nearest = Math.round(target / height) * height
      if (Math.abs(target - nearest) < EDGE_TOLERANCE) target = nearest
      stopSettle()
      running.current = animate(y, target, {
        type: "spring",
        // A pull past the edge returns briskly; a placement just stops.
        visualDuration: outOfBounds ? 0.45 : 0.55,
        bounce: 0,
        velocity,
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [height, y, bounds.min, bounds.max],
  )

  // Keep the track aligned when the viewport, and so the slide height, changes.
  useEffect(() => {
    if (usePager) y.set(-index * height)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height])

  // The reported slide is whichever one is nearest, so a rest between two of
  // them still drives the rail and the browser tint.
  useEffect(() => {
    if (!usePager) return
    const unsubscribe = y.on("change", (v) => {
      const position = -v / height
      const nearest = Math.max(0, Math.min(Math.round(position), lastIndex))
      setIndex((prev) => (prev === nearest ? prev : nearest))
      /*
       * Resting between two slides puts a different colour against each edge
       * of the screen, and the browser only gets one tint. Take it from the
       * slide covering the edge the browser actually draws its bar against,
       * so that edge has no seam.
       */
      const edge =
        tintEdge === "bottom"
          ? Math.ceil(position - 0.001)
          : Math.floor(position + 0.001)
      const clampedEdge = Math.max(0, Math.min(edge, lastIndex))
      setEdgeIndex((prev) => (prev === clampedEdge ? prev : clampedEdge))
    })
    return () => unsubscribe()
  }, [height, lastIndex, tintEdge, usePager, y])

  useEffect(() => {
    onActiveColorChange(inView ? slideColor(edgeIndex) : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, edgeIndex, onActiveColorChange, colors])

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

  /**
   * The whole rule. A fast release is scanning, so page; anything slower or
   * held is placing, so keep the position and simply stop moving.
   */
  const decide = useCallback(
    (velocity: number, dwell: number, distance: number, threshold: number) => {
      const speed = dwell > HOLD_MS ? 0 : Math.abs(velocity)
      const scanning = speed > threshold && distance > MIN_FLING_DISTANCE

      if (scanning) {
        const position = -y.get() / height
        // Land on the next boundary in the direction of travel.
        const target =
          velocity < 0 ? Math.ceil(position + 0.001) : Math.floor(position - 0.001)
        pageTo(target, velocity)
        setDecision({ kind: "paged", detail: `${Math.round(speed)} px/s` })
        return
      }

      glideTo(dwell > HOLD_MS ? 0 : velocity)
      setDecision({
        kind: "free",
        detail:
          dwell > HOLD_MS
            ? `held ${Math.round(dwell)} ms`
            : `${Math.round(Math.abs(velocity))} px/s`,
      })
    },
    [glideTo, height, pageTo, y],
  )

  /*
   * Pointer handling is done here rather than through Motion's drag, so the
   * two things this gesture is judged on can be exact: the edge uses Apple's
   * rubber band curve instead of a linear elasticity, and velocity is measured
   * over the closing window of the gesture rather than the whole of it.
   */
  const pointer = useRef({
    active: false,
    id: -1,
    startClientX: 0,
    startClientY: 0,
    startY: 0,
    axis: null as null | "y",
    samples: [] as { t: number; y: number }[],
  })

  const positionFor = (raw: number) => {
    if (raw > bounds.max) return bounds.max + rubberBand(raw - bounds.max, height)
    if (raw < bounds.min) return bounds.min + rubberBand(raw - bounds.min, height)
    return raw
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!usePager || !e.isPrimary) return
    stopSettle()
    const p = pointer.current
    p.active = true
    p.id = e.pointerId
    p.startClientX = e.clientX
    p.startClientY = e.clientY
    p.startY = y.get()
    p.axis = null
    p.samples = [{ t: performance.now(), y: y.get() }]
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const p = pointer.current
    if (!p.active || e.pointerId !== p.id) return
    const dy = e.clientY - p.startClientY
    const dx = e.clientX - p.startClientX

    // Commit to an axis once there is enough movement to tell them apart.
    if (!p.axis) {
      if (Math.abs(dy) < DIRECTION_LOCK_PX && Math.abs(dx) < DIRECTION_LOCK_PX) return
      if (Math.abs(dx) > Math.abs(dy)) {
        p.active = false // a sideways gesture is not ours
        return
      }
      p.axis = "y"
      e.currentTarget.setPointerCapture(e.pointerId)
    }

    y.set(positionFor(p.startY + dy))
    const t = performance.now()
    p.samples.push({ t, y: y.get() })
    while (p.samples.length > 2 && t - p.samples[0].t > VELOCITY_WINDOW_MS) {
      p.samples.shift()
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const p = pointer.current
    if (!p.active || e.pointerId !== p.id) return
    p.active = false
    if (!p.axis) return

    const now = performance.now()
    const recent = p.samples.filter((sample) => now - sample.t <= VELOCITY_WINDOW_MS)
    const lastMove = p.samples[p.samples.length - 1]?.t ?? now
    const dwell = now - lastMove

    /*
     * Normally the closing window holds plenty of samples, since pointers
     * report at display rate. If a slow gesture left fewer than two inside it,
     * fall back to the last pair rather than reporting a spurious zero.
     */
    const sampleWindow = recent.length >= 2 ? recent : p.samples.slice(-2)
    let velocity = 0
    if (sampleWindow.length >= 2) {
      const first = sampleWindow[0]
      const span = now - first.t
      if (span > 0) velocity = ((y.get() - first.y) / span) * 1000
    }
    velocity = Math.max(-MAX_FLING_VELOCITY, Math.min(MAX_FLING_VELOCITY, velocity))

    const current = y.get()
    const overshoot =
      current > bounds.max
        ? current - bounds.max
        : current < bounds.min
          ? current - bounds.min
          : 0

    // Pulled past either end: hand the overshoot to the page.
    if (Math.abs(overshoot) > MIN_FLING_DISTANCE) {
      glideTo(0)
      setDecision({ kind: "free", detail: "end of feed, handed to the page" })
      window.scrollBy({
        top: -overshoot,
        behavior: reducedMotion ? "auto" : "smooth",
      })
      return
    }

    decide(velocity, dwell, Math.abs(y.get() - p.startY), FLING_VELOCITY)
  }

  // Wheel and trackpad: follow the burst, then judge it by the same rule.
  useEffect(() => {
    const node = frameRef.current
    if (!node || !usePager) return
    let accumulated = 0
    let startedAt = 0
    let lastTickAt = 0
    let timer = 0

    const onWheel = (e: WheelEvent) => {
      const goingDown = e.deltaY > 0
      // At the ends, leave the event alone so the page scrolls natively.
      if ((goingDown && index === lastIndex) || (!goingDown && index === 0)) return
      e.preventDefault()
      const now = performance.now()
      if (!startedAt) {
        startedAt = now
        accumulated = 0
      }
      lastTickAt = now
      accumulated -= e.deltaY
      y.set(clampY(y.get() - e.deltaY))
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const elapsed = Math.max(lastTickAt - startedAt, 1)
        const velocity = (accumulated / elapsed) * 1000
        // Time the finger, or the fingers, spent still before the burst ended.
        const dwell = performance.now() - lastTickAt
        decide(velocity, dwell, Math.abs(accumulated), WHEEL_FLING_VELOCITY)
        startedAt = 0
        accumulated = 0
      }, WHEEL_IDLE_MS)
    }

    node.addEventListener("wheel", onWheel, { passive: false })
    return () => {
      node.removeEventListener("wheel", onWheel)
      window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decide, height, index, lastIndex, usePager, y])

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
    if (usePager) pageTo(targets[e.key])
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
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="h-full overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-inset"
          // Vertical panning is ours; pinch-zoom stays with the browser.
          style={{ touchAction: "pan-x pinch-zoom" }}
        >
          <motion.div style={{ y }}>{slides}</motion.div>
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
          {decision.kind === "paged"
            ? `scanning · ${decision.detail} · paged`
            : `placing · ${decision.detail} · position kept`}
        </p>
      )}

      <p aria-live="polite" className="sr-only">
        Slide {index + 1} of {reels.length}: {reels[index]?.title}
      </p>
    </div>
  )
}
