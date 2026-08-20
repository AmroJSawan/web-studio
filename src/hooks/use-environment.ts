import { useEffect, useState, useSyncExternalStore } from "react"

const QUERIES = {
  darkScheme: "(prefers-color-scheme: dark)",
  reducedMotion: "(prefers-reduced-motion: reduce)",
  reducedTransparency: "(prefers-reduced-transparency: reduce)",
  moreContrast: "(prefers-contrast: more)",
  canHover: "(hover: hover)",
  finePointer: "(pointer: fine)",
  p3Gamut: "(color-gamut: p3)",
  rec2020Gamut: "(color-gamut: rec2020)",
  hdr: "(dynamic-range: high)",
  portrait: "(orientation: portrait)",
} as const

export type MediaFlags = Record<keyof typeof QUERIES, boolean>

export function useMediaFlags(): MediaFlags {
  const [flags, setFlags] = useState<MediaFlags>(() => read())

  useEffect(() => {
    const lists = Object.values(QUERIES).map((q) => window.matchMedia(q))
    const update = () => setFlags(read())
    lists.forEach((l) => l.addEventListener("change", update))
    return () => lists.forEach((l) => l.removeEventListener("change", update))
  }, [])

  return flags
}

function read(): MediaFlags {
  return Object.fromEntries(
    Object.entries(QUERIES).map(([k, q]) => [k, window.matchMedia(q).matches]),
  ) as MediaFlags
}

export function useViewport() {
  const [v, setV] = useState(() => snapshot())
  useEffect(() => {
    const update = () => setV(snapshot())
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])
  return v

  function snapshot() {
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      dpr: window.devicePixelRatio,
    }
  }
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb)
      window.addEventListener("offline", cb)
      return () => {
        window.removeEventListener("online", cb)
        window.removeEventListener("offline", cb)
      }
    },
    () => navigator.onLine,
  )
}

interface NetworkInformation extends EventTarget {
  effectiveType?: string
  saveData?: boolean
}

export function useConnection() {
  const conn = (navigator as { connection?: NetworkInformation }).connection
  const [state, setState] = useState(() => ({
    effectiveType: conn?.effectiveType ?? null,
    saveData: conn?.saveData ?? false,
  }))
  useEffect(() => {
    if (!conn) return
    const update = () =>
      setState({
        effectiveType: conn.effectiveType ?? null,
        saveData: conn.saveData ?? false,
      })
    conn.addEventListener("change", update)
    return () => conn.removeEventListener("change", update)
  }, [conn])
  return state
}

interface BatteryManager extends EventTarget {
  level: number
  charging: boolean
}

export function useBattery() {
  const [state, setState] = useState<{ level: number; charging: boolean } | null>(null)
  useEffect(() => {
    const nav = navigator as { getBattery?: () => Promise<BatteryManager> }
    if (!nav.getBattery) return
    let battery: BatteryManager | undefined
    const update = () =>
      battery && setState({ level: battery.level, charging: battery.charging })
    nav.getBattery().then((b) => {
      battery = b
      update()
      b.addEventListener("levelchange", update)
      b.addEventListener("chargingchange", update)
    })
    return () => {
      battery?.removeEventListener("levelchange", update)
      battery?.removeEventListener("chargingchange", update)
    }
  }, [])
  return state
}

export function useLocalHour(): number {
  const [hour, setHour] = useState(() => new Date().getHours())
  useEffect(() => {
    const id = setInterval(() => setHour(new Date().getHours()), 60_000)
    return () => clearInterval(id)
  }, [])
  return hour
}

export function engineName(): string {
  const ua = navigator.userAgent
  const data = (navigator as { userAgentData?: { brands: { brand: string }[] } })
    .userAgentData
  if (data?.brands.some((b) => /Chromium/i.test(b.brand))) return "Blink"
  if (/Firefox\//.test(ua)) return "Gecko"
  if (/Safari\//.test(ua) && !/Chrome|Chromium/.test(ua)) return "WebKit"
  return "unknown"
}

export function gpuRenderer(): string | null {
  try {
    const canvas = document.createElement("canvas")
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl")
    if (!gl) return null
    const ext = gl.getExtension("WEBGL_debug_renderer_info")
    const raw = ext
      ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER))
    return raw.replace(/^ANGLE \((.*)\)$/, "$1")
  } catch {
    return null
  }
}

export const supportsBackdropFilter =
  typeof CSS !== "undefined" &&
  (CSS.supports("backdrop-filter", "blur(1px)") ||
    CSS.supports("-webkit-backdrop-filter", "blur(1px)"))
