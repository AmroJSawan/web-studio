import { useMemo, useState, type ReactNode } from "react"
import { MeshGradient } from "@paper-design/shaders-react"
import { MotionConfig, motion } from "motion/react"
import { Badge } from "@/components/ui/badge"
import { CollisionPopover } from "@/components/collision-popover"
import { Navbar, type NavItem } from "@/components/navbar"
import { ReelsFeed, type Reel } from "@/components/reels-feed"
import { useDevice } from "@/hooks/use-device"
import { useBrowserChromeTint } from "@/hooks/use-chrome-tint"
import {
  supportsScrollTimeline,
  supportsSnapStop,
  useActiveSection,
  useScrollState,
  useStuck,
} from "@/hooks/use-scroll-state"
import { useViewportChrome } from "@/hooks/use-viewport-chrome"
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

type Palette = {
  name: string
  colors: [string, string, string, string]
  /** The tone the browser chrome and the page root are painted with. */
  base: string
}

function paletteFor(hour: number, dark: boolean): Palette {
  if (hour >= 21 || hour < 5)
    return { name: "night", base: "#05060f", colors: ["#05060f", "#131a3d", "#1e1b4b", "#0b3b4a"] }
  if (hour < 8)
    return { name: "dawn", base: "#1b1330", colors: ["#1b1330", "#7c2d5b", "#c2643f", "#28304d"] }
  if (hour < 17)
    return dark
      ? { name: "day", base: "#0b1220", colors: ["#0b1220", "#123a5c", "#0e7490", "#1e293b"] }
      : { name: "day", base: "#dbeafe", colors: ["#dbeafe", "#93c5fd", "#67e8f9", "#c7d2fe"] }
  return { name: "dusk", base: "#160f2e", colors: ["#160f2e", "#5b2a86", "#b45309", "#1e1b4b"] }
}

const ENGINE = engineName()
const GPU = gpuRenderer()

const SECTIONS: NavItem[] = [
  { id: "top", label: "Top" },
  { id: "chrome", label: "Chrome" },
  { id: "stack", label: "Stack" },
  { id: "float", label: "Float" },
  { id: "signals", label: "Signals" },
  { id: "reels", label: "Reels" },
]

const REELS: Reel[] = [
  {
    code: "scroll-snap-type: y mandatory",
    title: "Every rest lands on a slide",
    body: "The scroller is never allowed to stop between two items, so the feed has no half-states.",
  },
  {
    code: "scroll-snap-align: start",
    title: "Each slide parks at the top edge",
    body: "The snap point is the leading edge of the item, which is what makes a full-height slide fill the frame exactly.",
  },
  {
    code: "scroll-snap-stop: always",
    title: "One flick moves one slide",
    body: "Without it a hard fling sails past three items. This is the property that separates a reels feel from a normal snap list.",
  },
  {
    code: "overscroll-behavior-y: contain",
    title: "The page behind stays put",
    body: "Reaching either end of the feed does not chain the gesture out to the document, and pull-to-refresh stays suppressed.",
  },
  {
    code: "height: measured pixels",
    title: "No gap under the toolbar",
    body: "Slides are sized from the live visual viewport rather than 100vh, so a collapsing mobile toolbar cannot leave a strip of the next slide showing.",
  },
]

const STACK_CARDS = [
  {
    title: "Sticky is a contract with the viewport",
    body: "Each header parks at its own offset, so the ones above stay legible instead of being overwritten. The offsets are computed from the bar height, not hard-coded magic numbers.",
  },
  {
    title: "Stacking survives a collapsing toolbar",
    body: "Mobile browsers retract the address bar as you scroll, which changes the viewport height mid-gesture. Offsets measured in rem against a fixed bar stay stable through that.",
  },
  {
    title: "The last card holds the floor",
    body: "When the section scrolls past, the stack releases in order. No layout shift, no jump: sticky positioning never removes an element from flow.",
  },
]

export default function App() {
  const flags = useMediaFlags()
  const viewport = useViewport()
  const chrome = useViewportChrome()
  const device = useDevice()
  const scroll = useScrollState()
  const online = useOnline()
  const connection = useConnection()
  const battery = useBattery()
  const hour = useLocalHour()

  const sectionIds = useMemo(() => SECTIONS.map((s) => s.id), [])
  const active = useActiveSection(sectionIds)
  const { sentinelRef, stuck } = useStuck(0)
  const [keyboardProbe, setKeyboardProbe] = useState("")

  const palette = paletteFor(hour, flags.darkScheme)
  const lightUi = !flags.darkScheme && palette.name === "day"
  const glass = supportsBackdropFilter && !flags.reducedTransparency
  const railMode = device.navMode === "rail"
  const webkit = ENGINE === "WebKit"
  const reelHeight = Math.max(360, Math.min(Math.round(chrome.visualHeight * 0.68), 560))

  // Paints the scene colour onto the root so the browser chrome can match it.
  useBrowserChromeTint(palette.base, lightUi ? "light" : "dark")

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
      ? "bg-white/45 backdrop-blur-2xl"
      : "bg-white/8 backdrop-blur-2xl"
    : lightUi
      ? "bg-white"
      : "bg-slate-900"
  const accent = flags.p3Gamut ? "color(display-p3 0.2 0.85 0.75)" : "#2dd4bf"

  /*
   * Stacked sticky cards sit on top of each other, not on the shader, so they
   * need enough opacity to occlude the card beneath. The lighter `surface`
   * tint would let the previous card's text read through.
   */
  const stackSurface = glass
    ? lightUi
      ? "bg-white/90 backdrop-blur-2xl"
      : "bg-slate-950/90 backdrop-blur-2xl"
    : lightUi
      ? "bg-white"
      : "bg-slate-900"

  // Floating navigation retreats while reading downward, returns on upward intent.
  const navHidden = scroll.direction === "down" && !scroll.atTop && !scroll.atBottom

  const goToSection = (id: string) =>
    document.getElementById(id)?.scrollIntoView({
      behavior: flags.reducedMotion ? "auto" : "smooth",
      block: "start",
    })

  const signals: [string, string][] = [
    ["device class", device.kind],
    ["nav form", `${device.navMode} (${device.orientation})`],
    ["primary input", device.touch ? "touch" : "pointer"],
    [
      "touch points",
      device.maxTouchPoints > 0 ? String(device.maxTouchPoints) : "none",
    ],
    ["display mode", device.standalone ? "standalone" : "browser tab"],
    [
      "viewport segments",
      device.spanned
        ? `${device.segments.horizontal}×${device.segments.vertical} (spanned)`
        : "single",
    ],
    ["ua platform", device.platform ?? "not exposed"],
    [
      "ua mobile hint",
      device.uaMobile === null ? "not exposed" : String(device.uaMobile),
    ],
    ["engine", ENGINE],
    ["gpu", GPU ? GPU.split(",")[0].slice(0, 36) : "n/a"],
    ["viewport", `${viewport.width}×${viewport.height} @ ${viewport.dpr}x`],
    ["orientation", flags.portrait ? "portrait" : "landscape"],
    ["scheme", flags.darkScheme ? "dark" : "light"],
    ["gamut", flags.rec2020Gamut ? "rec2020" : flags.p3Gamut ? "p3" : "srgb"],
    ["dynamic range", flags.hdr ? "high" : "standard"],
    ["contrast", flags.moreContrast ? "more" : "default"],
    ["pointer", flags.finePointer ? "fine" : "coarse"],
    ["motion", flags.reducedMotion ? "reduced" : "full"],
    ["transparency", glass ? "glass" : "solid fallback"],
    ["scroll timeline", supportsScrollTimeline ? "native css" : "js fallback"],
    ["snap stop", supportsSnapStop ? "always supported" : "not supported"],
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
    ["locale", navigator.language],
    ["timezone", Intl.DateTimeFormat().resolvedOptions().timeZone],
    ["scene", `${palette.name} (${hour}:00 local)`],
  ]

  const chromeRows: [string, string][] = [
    ["small (100svh)", `${Math.round(chrome.small)}px`],
    ["large (100lvh)", `${Math.round(chrome.large)}px`],
    ["dynamic (100dvh)", `${Math.round(chrome.dynamic)}px`],
    ["layout (100vh)", `${Math.round(chrome.layoutHeight)}px`],
    ["visual viewport", `${Math.round(chrome.visualHeight)}px`],
    ["collapsing chrome", `${chrome.chromeHeight}px`],
    ["keyboard inset", `${chrome.keyboardInset}px`],
    ["safe area top", `${Math.round(chrome.safeTop)}px`],
    ["safe area bottom", `${Math.round(chrome.safeBottom)}px`],
    ["pinch scale", chrome.scale.toFixed(2)],
    ["scroll progress", `${Math.round(scroll.progress * 100)}%`],
    ["direction", scroll.direction],
  ]

  return (
    <MotionConfig reducedMotion="user">
      <div className={`relative ${ink}`}>
        <div
          aria-hidden
          className="fixed inset-0 -z-10"
          style={{ backgroundColor: palette.base }}
        >
          <MeshGradient
            className="h-full w-full"
            colors={palette.colors}
            speed={flags.reducedMotion ? 0 : 0.4}
          />
        </div>

        <div ref={sentinelRef} aria-hidden className="absolute top-0 h-px w-full" />

        <header
          className="sticky top-0 z-40"
          style={{ paddingTop: chrome.safeTop }}
        >
          {/*
            Glass on an absolute child, not on the sticky box. Safari samples
            background-color and backdrop-filter from sticky elements at the
            viewport edge to tint its floating toolbar, and a translucent
            white header would bleach it.
          */}
          <span
            aria-hidden
            className={`absolute inset-0 border-b transition-opacity duration-300 ${border} ${surface} ${
              stuck ? "opacity-100" : "opacity-0"
            }`}
          />
          <div
            className={`relative mx-auto flex w-full max-w-5xl items-center justify-between px-6 transition-all duration-300 ${
              stuck ? "py-2.5" : "py-5"
            }`}
          >
            <span
              className={`font-medium tracking-widest uppercase transition-all duration-300 ${
                stuck ? "text-xs" : "text-sm"
              } ${inkFaint}`}
            >
              web studio
            </span>
            {device.navMode === "top" && (
              <Navbar
                items={SECTIONS}
                active={active}
                hidden={false}
                device={device}
                chrome={chrome}
                glass={glass}
                lightUi={lightUi}
                webkit={webkit}
                onSelect={goToSection}
              />
            )}
            <span className={`font-mono text-xs ${inkFaint}`}>
              {stuck ? `${Math.round(scroll.progress * 100)}%` : device.kind}
            </span>
          </div>
          <div className={`relative h-px w-full ${lightUi ? "bg-slate-900/10" : "bg-white/10"}`}>
            <div
              className="scroll-progress-bar h-px w-full origin-left"
              style={{
                background: accent,
                ...(supportsScrollTimeline
                  ? {}
                  : { transform: `scaleX(${scroll.progress})` }),
              }}
            />
          </div>
        </header>

        {/* The rail occupies the leading edge, so the content yields that space. */}
        <main
          className="mx-auto w-full max-w-5xl px-6 pb-40"
          style={railMode ? { paddingLeft: chrome.safeLeft + 168 } : undefined}
        >
          <Section id="top" first>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className={`rounded-3xl border p-8 shadow-2xl shadow-black/30 md:p-12 ${border} ${surface}`}
            >
              <p className={`text-sm font-medium tracking-widest uppercase ${inkFaint}`}>
                floating &amp; sticky
              </p>
              <h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight md:text-5xl">
                Elements that know where the edge is.
              </h1>
              <p className={`mt-5 max-w-xl text-lg ${inkSoft}`}>
                The navigation changes shape with the device: an inline bar for
                a pointer, a dock in the thumb zone for a phone held upright,
                and a rail when that phone turns on its side and vertical space
                becomes the scarce resource. It is classified from input
                capability, never from a user agent string.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Badge
                  variant="outline"
                  className={border}
                  style={{ color: accent, borderColor: "currentColor" }}
                >
                  {supportsScrollTimeline ? "css scroll timeline" : "js scroll fallback"}
                </Badge>
                <Badge variant="outline" className={`${border} ${inkSoft}`}>
                  {chrome.chromeHeight > 0
                    ? `${chrome.chromeHeight}px collapsing chrome`
                    : "static chrome"}
                </Badge>
                <Badge variant="outline" className={`${border} ${inkSoft}`}>
                  {device.kind} · {device.navMode} nav
                </Badge>
              </div>
            </motion.div>
          </Section>

          <Section id="chrome">
            <SectionTitle inkFaint={inkFaint}>viewport chrome</SectionTitle>
            <div className="grid gap-4 md:grid-cols-[1fr_20rem]">
              <Card border={border} surface={surface}>
                <h2 className="text-2xl font-semibold tracking-tight">
                  Measured, not assumed.
                </h2>
                <p className={`mt-4 ${inkSoft}`}>
                  These numbers come from a probe element resolving{" "}
                  <code className="font-mono text-[0.9em]">100svh</code>,{" "}
                  <code className="font-mono text-[0.9em]">100lvh</code> and{" "}
                  <code className="font-mono text-[0.9em]">100dvh</code>, plus the
                  visual viewport for the live values. The gap between small and
                  large is exactly how much browser UI slides away as you scroll.
                </p>
                <p className={`mt-4 ${inkSoft}`}>
                  Focus the field to open the on-screen keyboard on a touch
                  device: the keyboard inset becomes non-zero and the dock rises
                  to clear it.
                </p>
                <input
                  value={keyboardProbe}
                  onChange={(e) => setKeyboardProbe(e.target.value)}
                  placeholder="Focus me to raise the keyboard"
                  aria-label="Keyboard inset probe"
                  className={`mt-5 min-h-11 w-full rounded-xl border px-4 text-base outline-none ${border} ${
                    lightUi
                      ? "bg-white/60 placeholder:text-slate-400"
                      : "bg-white/5 placeholder:text-white/30"
                  }`}
                />
              </Card>
              <Readout rows={chromeRows} border={border} surface={surface} inkFaint={inkFaint} inkSoft={inkSoft} title="live" />
            </div>
          </Section>

          <Section id="stack">
            <SectionTitle inkFaint={inkFaint}>stacking</SectionTitle>
            <div className="space-y-4">
              {STACK_CARDS.map((card, i) => (
                <div
                  key={card.title}
                  className={`sticky rounded-3xl border p-7 shadow-2xl shadow-black/40 md:p-9 ${border} ${stackSurface}`}
                  style={{ top: `${5 + i * 3.5}rem`, zIndex: 10 + i }}
                >
                  <p className={`font-mono text-xs ${inkFaint}`}>
                    0{i + 1} · top {5 + i * 3.5}rem
                  </p>
                  <h3 className="mt-2 text-xl font-semibold tracking-tight md:text-2xl">
                    {card.title}
                  </h3>
                  <p className={`mt-3 max-w-2xl ${inkSoft}`}>{card.body}</p>
                </div>
              ))}
            </div>
            <div className="h-[12svh]" aria-hidden />
          </Section>

          <Section id="float">
            <SectionTitle inkFaint={inkFaint}>collision aware</SectionTitle>
            <Card border={border} surface={surface}>
              <h2 className="text-2xl font-semibold tracking-tight">
                Floating panels that refuse to fall off screen.
              </h2>
              <p className={`mt-4 max-w-2xl ${inkSoft}`}>
                Each panel measures the room left in the visual viewport before
                it paints, then flips above its trigger or shifts sideways to
                stay fully visible. Open one and scroll: it re-measures on every
                frame the viewport changes, including while the mobile toolbar
                collapses. The current decision is printed inside the panel.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <CollisionPopover label="Near the left edge" glass={glass} lightUi={lightUi}>
                  Anchored left. When the panel would overflow the left edge it
                  shifts right and reports the offset.
                </CollisionPopover>
                <span className="flex-1" />
                <CollisionPopover label="Near the right edge" glass={glass} lightUi={lightUi}>
                  Anchored right. Same panel, mirrored decision, no separate
                  code path.
                </CollisionPopover>
              </div>
            </Card>
          </Section>

          <Section id="signals">
            <SectionTitle inkFaint={inkFaint}>signals</SectionTitle>
            <Readout
              rows={signals}
              border={border}
              surface={surface}
              inkFaint={inkFaint}
              inkSoft={inkSoft}
              title="environment"
            />
          </Section>

          <Section id="reels">
            <SectionTitle inkFaint={inkFaint}>snap feed</SectionTitle>
            <Card border={border} surface={surface}>
              <h2 className="text-2xl font-semibold tracking-tight">
                One flick, one slide.
              </h2>
              <p className={`mt-4 max-w-2xl ${inkSoft}`}>
                A reels-style feed built on CSS scroll snap alone. Flick it hard:
                it advances exactly one slide instead of sailing past three, and
                the page behind it does not move. Each slide names the property
                doing the work.
                {!supportsSnapStop &&
                  " This browser does not support scroll-snap-stop, so a fast fling may cross more than one slide."}
              </p>
              <div className="mt-7">
                <ReelsFeed
                  reels={REELS}
                  colors={palette.colors}
                  height={reelHeight}
                  reducedMotion={flags.reducedMotion}
                  lightUi={lightUi}
                  glass={glass}
                />
              </div>
            </Card>
          </Section>
        </main>

        {device.navMode !== "top" && (
          <Navbar
            items={SECTIONS}
            active={active}
            hidden={navHidden}
            device={device}
            chrome={chrome}
            glass={glass}
            lightUi={lightUi}
            webkit={webkit}
            onSelect={goToSection}
          />
        )}
      </div>
    </MotionConfig>
  )
}

function Section({
  id,
  children,
  first,
}: {
  id: string
  children: ReactNode
  first?: boolean
}) {
  return (
    <section
      id={id}
      className={`reveal-on-view scroll-mt-24 ${first ? "pt-8 pb-24" : "py-24"}`}
    >
      {children}
    </section>
  )
}

function SectionTitle({
  children,
  inkFaint,
}: {
  children: ReactNode
  inkFaint: string
}) {
  return (
    <p className={`mb-4 font-mono text-xs tracking-widest uppercase ${inkFaint}`}>
      {children}
    </p>
  )
}

function Card({
  children,
  border,
  surface,
}: {
  children: ReactNode
  border: string
  surface: string
}) {
  return (
    <div
      className={`rounded-3xl border p-7 shadow-2xl shadow-black/30 md:p-9 ${border} ${surface}`}
    >
      {children}
    </div>
  )
}

function Readout({
  rows,
  border,
  surface,
  inkFaint,
  inkSoft,
  title,
}: {
  rows: [string, string][]
  border: string
  surface: string
  inkFaint: string
  inkSoft: string
  title: string
}) {
  return (
    <aside
      className={`h-fit rounded-3xl border p-6 font-mono text-[13px] shadow-2xl shadow-black/30 ${border} ${surface}`}
    >
      <p className={`mb-4 text-xs tracking-widest uppercase ${inkFaint}`}>{title}</p>
      <dl className="space-y-1.5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <dt className={inkFaint}>{label}</dt>
            <dd className={`text-right ${inkSoft}`}>{value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  )
}
