import { useEffect, useRef } from "react"
import { MeshGradient } from "@paper-design/shaders-react"
import { motion, MotionConfig } from "motion/react"
import { Badge } from "@/components/ui/badge"
import {
  engineName,
  gpuRenderer,
  supportsBackdropFilter,
  useBattery,
  useConnection,
  useLocalHour,
  useMediaFlags,
  useOnline,
  useViewport,
} from "@/hooks/use-environment"

type Palette = { name: string; colors: [string, string, string, string] }

function paletteFor(hour: number, dark: boolean): Palette {
  if (hour >= 21 || hour < 5)
    return { name: "night", colors: ["#05060f", "#131a3d", "#1e1b4b", "#0b3b4a"] }
  if (hour < 8)
    return { name: "dawn", colors: ["#1b1330", "#7c2d5b", "#c2643f", "#28304d"] }
  if (hour < 17)
    return dark
      ? { name: "day", colors: ["#0b1220", "#123a5c", "#0e7490", "#1e293b"] }
      : { name: "day", colors: ["#dbeafe", "#93c5fd", "#67e8f9", "#c7d2fe"] }
  return { name: "dusk", colors: ["#160f2e", "#5b2a86", "#b45309", "#1e1b4b"] }
}

const ENGINE = engineName()
const GPU = gpuRenderer()

export default function App() {
  const flags = useMediaFlags()
  const viewport = useViewport()
  const online = useOnline()
  const connection = useConnection()
  const battery = useBattery()
  const hour = useLocalHour()

  const palette = paletteFor(hour, flags.darkScheme)
  const lightUi = !flags.darkScheme && palette.name === "day"
  const glass = supportsBackdropFilter && !flags.reducedTransparency
  const trackCursor = flags.canHover && flags.finePointer && !flags.reducedMotion

  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onVisibility = () => {
      document.title = document.hidden ? "Web Studio · idle" : "Web Studio"
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => document.removeEventListener("visibilitychange", onVisibility)
  }, [])

  useEffect(() => {
    if (!trackCursor) return
    const onMove = (e: PointerEvent) => {
      const el = panelRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      el.style.setProperty("--mx", `${e.clientX - rect.left}px`)
      el.style.setProperty("--my", `${e.clientY - rect.top}px`)
    }
    window.addEventListener("pointermove", onMove)
    return () => window.removeEventListener("pointermove", onMove)
  }, [trackCursor])

  const ink = lightUi ? "text-slate-900" : "text-white"
  const inkSoft = lightUi ? "text-slate-700" : "text-white/70"
  const inkFaint = lightUi ? "text-slate-500" : "text-white/45"
  const border = flags.moreContrast
    ? lightUi
      ? "border-slate-900/60"
      : "border-white/60"
    : lightUi
      ? "border-slate-900/10"
      : "border-white/15"
  const surface = glass
    ? lightUi
      ? "bg-white/40 backdrop-blur-2xl"
      : "bg-white/10 backdrop-blur-2xl"
    : lightUi
      ? "bg-white"
      : "bg-slate-900"
  const accent = flags.p3Gamut
    ? "color(display-p3 0.2 0.85 0.75)"
    : "#2dd4bf"

  const signals: [string, string][] = [
    ["engine", ENGINE],
    ["gpu", GPU ? GPU.split(",")[0].slice(0, 36) : "n/a"],
    ["viewport", `${viewport.width}×${viewport.height} @ ${viewport.dpr}x`],
    ["orientation", flags.portrait ? "portrait" : "landscape"],
    ["scheme", flags.darkScheme ? "dark" : "light"],
    ["gamut", flags.rec2020Gamut ? "rec2020" : flags.p3Gamut ? "p3" : "srgb"],
    ["dynamic range", flags.hdr ? "high" : "standard"],
    ["contrast", flags.moreContrast ? "more" : "default"],
    ["pointer", flags.finePointer ? "fine" : "coarse"],
    ["hover", flags.canHover ? "available" : "none"],
    ["motion", flags.reducedMotion ? "reduced" : "full"],
    ["transparency", !glass ? "solid fallback" : "glass"],
    [
      "network",
      online
        ? [connection.effectiveType, connection.saveData && "data-saver"]
            .filter(Boolean)
            .join(" · ") || "online"
        : "offline",
    ],
    [
      "battery",
      battery
        ? `${Math.round(battery.level * 100)}%${battery.charging ? " · charging" : ""}`
        : "n/a",
    ],
    ["cpu threads", String(navigator.hardwareConcurrency ?? "n/a")],
    ["locale", navigator.language],
    ["timezone", Intl.DateTimeFormat().resolvedOptions().timeZone],
    ["scene", `${palette.name} (${hour}:00 local)`],
  ]

  return (
    <MotionConfig reducedMotion="user">
      <main className={`relative min-h-svh overflow-hidden ${ink}`}>
        <MeshGradient
          className="absolute inset-0 h-full w-full"
          colors={palette.colors}
          speed={flags.reducedMotion ? 0 : 0.4}
        />
        <div
          className={`relative z-10 mx-auto flex min-h-svh w-full max-w-5xl flex-col items-stretch justify-center gap-6 p-6 md:flex-row md:items-center ${flags.finePointer ? "" : "gap-8 p-8"}`}
        >
          <motion.section
            ref={panelRef}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className={`relative flex-1 overflow-hidden rounded-3xl border p-8 shadow-2xl shadow-black/30 md:p-10 ${border} ${surface}`}
          >
            {trackCursor && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  background: `radial-gradient(320px circle at var(--mx, 50%) var(--my, 50%), ${lightUi ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.08)"}, transparent 70%)`,
                }}
              />
            )}
            <p className={`text-sm font-medium tracking-widest uppercase ${inkFaint}`}>
              web studio
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">
              This page is reading the room.
            </h1>
            <p className={`mt-4 ${inkSoft}`}>
              The scene palette follows your local hour. Glass falls back to a
              solid surface when transparency is reduced or unsupported. Motion
              stops when your system asks for it. Accents use display-P3 only
              on wide-gamut screens.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Badge
                variant="outline"
                className={border}
                style={{ color: accent, borderColor: "currentColor" }}
              >
                {online ? "online" : "offline"}
              </Badge>
              <Badge variant="outline" className={`${border} ${inkSoft}`}>
                {palette.name} scene
              </Badge>
              <Badge variant="outline" className={`${border} ${inkSoft}`}>
                {glass ? "liquid glass" : "solid surface"}
              </Badge>
            </div>
          </motion.section>

          <motion.aside
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className={`w-full rounded-3xl border p-6 font-mono text-[13px] shadow-2xl shadow-black/30 md:w-80 ${border} ${surface}`}
          >
            <p className={`mb-4 text-xs tracking-widest uppercase ${inkFaint}`}>
              signals
            </p>
            <dl className="space-y-1.5">
              {signals.map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-3">
                  <dt className={inkFaint}>{label}</dt>
                  <dd className={`text-right ${inkSoft}`}>{value}</dd>
                </div>
              ))}
            </dl>
          </motion.aside>
        </div>
      </main>
    </MotionConfig>
  )
}
