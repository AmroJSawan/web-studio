import { useEffect, useRef, useState } from "react"

export type ScrollDirection = "up" | "down"

export interface ScrollState {
  y: number
  progress: number
  direction: ScrollDirection
  atTop: boolean
  atBottom: boolean
}

/** Ignore jitter below this many pixels before flipping direction. */
const DIRECTION_THRESHOLD = 6

export function useScrollState(): ScrollState {
  const [state, setState] = useState<ScrollState>({
    y: 0,
    progress: 0,
    direction: "up",
    atTop: true,
    atBottom: false,
  })
  const lastY = useRef(0)
  const lastDirection = useRef<ScrollDirection>("up")

  useEffect(() => {
    let frame = 0
    const read = () => {
      const y = window.scrollY
      const max = document.documentElement.scrollHeight - window.innerHeight
      if (Math.abs(y - lastY.current) > DIRECTION_THRESHOLD) {
        lastDirection.current = y > lastY.current ? "down" : "up"
        lastY.current = y
      }
      setState({
        y,
        progress: max > 0 ? Math.min(1, Math.max(0, y / max)) : 0,
        direction: lastDirection.current,
        atTop: y <= 2,
        atBottom: max > 0 && y >= max - 2,
      })
    }
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(read)
    }
    read()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
    }
  }, [])

  return state
}

/**
 * Detects whether a `position: sticky` element has reached its stuck offset,
 * using a zero-height sentinel above it rather than comparing scroll numbers.
 */
export function useStuck(topOffset: number) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(false)

  useEffect(() => {
    const node = sentinelRef.current
    if (!node) return
    const observer = new IntersectionObserver(
      ([entry]) => setStuck(!entry.isIntersecting),
      { rootMargin: `-${topOffset}px 0px 0px 0px`, threshold: 0 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [topOffset])

  return { sentinelRef, stuck }
}

/** Tracks which section is currently occupying the middle of the viewport. */
export function useActiveSection(ids: string[]): string {
  const [active, setActive] = useState(ids[0] ?? "")

  useEffect(() => {
    const nodes = ids
      .map((id) => document.getElementById(id))
      .filter((n): n is HTMLElement => Boolean(n))
    if (!nodes.length) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible) setActive(visible.target.id)
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: [0, 0.25, 0.5, 1] },
    )
    nodes.forEach((n) => observer.observe(n))
    return () => observer.disconnect()
  }, [ids])

  return active
}

export const supportsScrollTimeline =
  typeof CSS !== "undefined" && CSS.supports("animation-timeline", "scroll()")
