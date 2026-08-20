import { useEffect, useState } from "react"

export type DeviceKind = "phone" | "tablet" | "desktop"
/** Where the navigation belongs on this device. */
export type NavMode = "top" | "dock" | "rail"

export interface Device {
  kind: DeviceKind
  navMode: NavMode
  orientation: "portrait" | "landscape"
  /** Primary input is touch, rather than merely touch-capable. */
  touch: boolean
  /** Touch hardware exists even if the primary pointer is a mouse. */
  touchCapable: boolean
  maxTouchPoints: number
  /** Installed as a PWA, so the browser draws no toolbar of its own. */
  standalone: boolean
  /** Foldables report more than one segment when spanned across the hinge. */
  segments: { horizontal: number; vertical: number }
  spanned: boolean
  /** Chromium-only client hints. Null on WebKit and Gecko: never guessed. */
  platform: string | null
  uaMobile: boolean | null
  width: number
  height: number
}

/** Below this the inline top navigation stops fitting and moves to a dock. */
const TOP_NAV_MIN_WIDTH = 700
/** Classic tablet threshold: shortest side at or above 600px. */
const TABLET_MIN_SHORT_SIDE = 600
/** A landscape phone has too little height to spend any of it on a top bar. */
const SHORT_VIEWPORT = 500

function countSegments(axis: "horizontal" | "vertical"): number {
  for (let n = 3; n >= 2; n--) {
    if (window.matchMedia(`(${axis}-viewport-segments: ${n})`).matches) return n
  }
  return 1
}

interface UAData {
  mobile?: boolean
  platform?: string
}

function classify(): Device {
  const width = window.innerWidth
  const height = window.innerHeight
  const coarse = window.matchMedia("(pointer: coarse)").matches
  const canHover = window.matchMedia("(hover: hover)").matches
  const touchCapable =
    window.matchMedia("(any-pointer: coarse)").matches || navigator.maxTouchPoints > 0
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches

  const segments = {
    horizontal: countSegments("horizontal"),
    vertical: countSegments("vertical"),
  }
  const spanned = segments.horizontal > 1 || segments.vertical > 1

  /*
   * Classified by capability rather than by user agent. A touchscreen laptop
   * reports `pointer: fine` with `any-pointer: coarse` and is correctly a
   * desktop; a tablet reports a coarse primary pointer and no hover.
   */
  const touch = coarse && !canHover
  const shortSide = Math.min(width, height)
  let kind: DeviceKind
  if (!touch) kind = "desktop"
  else if (shortSide >= TABLET_MIN_SHORT_SIDE || spanned) kind = "tablet"
  else kind = "phone"

  const orientation = width >= height ? "landscape" : "portrait"
  const shortViewport = height < SHORT_VIEWPORT

  /*
   * Form factor decides the shape of the navigation:
   * a pointer device gets an inline bar, a phone held upright gets a dock in
   * the thumb zone, and a phone on its side gets a rail so the scarce
   * vertical space stays with the content.
   */
  let navMode: NavMode
  if (kind === "phone" && orientation === "landscape" && shortViewport) navMode = "rail"
  else if (kind === "phone") navMode = "dock"
  else navMode = width >= TOP_NAV_MIN_WIDTH ? "top" : "dock"

  const ua = (navigator as { userAgentData?: UAData }).userAgentData

  return {
    kind,
    navMode,
    orientation,
    touch,
    touchCapable,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    standalone,
    segments,
    spanned,
    platform: ua?.platform ?? null,
    uaMobile: ua?.mobile ?? null,
    width,
    height,
  }
}

export function useDevice(): Device {
  const [device, setDevice] = useState<Device>(() => classify())

  useEffect(() => {
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setDevice(classify()))
    }
    const queries = [
      "(pointer: coarse)",
      "(hover: hover)",
      "(any-pointer: coarse)",
      "(display-mode: standalone)",
      "(horizontal-viewport-segments: 2)",
      "(vertical-viewport-segments: 2)",
    ].map((q) => window.matchMedia(q))

    queries.forEach((q) => q.addEventListener("change", update))
    window.addEventListener("resize", update)
    window.addEventListener("orientationchange", update)
    update()
    return () => {
      cancelAnimationFrame(frame)
      queries.forEach((q) => q.removeEventListener("change", update))
      window.removeEventListener("resize", update)
      window.removeEventListener("orientationchange", update)
    }
  }, [])

  return device
}
