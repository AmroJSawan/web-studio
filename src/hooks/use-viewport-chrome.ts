import { useEffect, useState } from "react"

export interface ViewportChrome {
  /** Height of the visual viewport: shrinks when the on-screen keyboard opens. */
  visualHeight: number
  /** Layout viewport height, i.e. what `100vh` resolves to. */
  layoutHeight: number
  /** Small viewport height: browser toolbars fully expanded (`100svh`). */
  small: number
  /** Large viewport height: browser toolbars fully retracted (`100lvh`). */
  large: number
  /** Dynamic viewport height: the live value (`100dvh`). */
  dynamic: number
  /** Pixels of browser UI that expand and collapse while scrolling. */
  chromeHeight: number
  /** Pixels currently occupied by the on-screen keyboard, 0 when closed. */
  keyboardInset: number
  /** Visual viewport pan offset, non-zero while pinch-zoomed. */
  offsetTop: number
  /** Pinch-zoom scale, 1 when not zoomed. */
  scale: number
  /** Bottom safe-area inset (home indicator, gesture bar). */
  safeBottom: number
  safeTop: number
}

/** Measures `100svh` / `100lvh` / `100dvh` with an off-screen probe element. */
function probeUnits() {
  const probe = document.createElement("div")
  probe.style.cssText =
    "position:absolute;top:0;left:0;width:0;visibility:hidden;pointer-events:none"
  document.body.appendChild(probe)
  const measure = (unit: string) => {
    probe.style.height = `100${unit}`
    return probe.getBoundingClientRect().height
  }
  const result = {
    small: measure("svh"),
    large: measure("lvh"),
    dynamic: measure("dvh"),
  }
  probe.remove()
  return result
}

function safeAreaInsets() {
  const probe = document.createElement("div")
  probe.style.cssText =
    "position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;" +
    "padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)"
  document.body.appendChild(probe)
  const style = getComputedStyle(probe)
  const insets = {
    safeTop: parseFloat(style.paddingTop) || 0,
    safeBottom: parseFloat(style.paddingBottom) || 0,
  }
  probe.remove()
  return insets
}

function snapshot(): ViewportChrome {
  const vv = window.visualViewport
  const units = probeUnits()
  const insets = safeAreaInsets()
  const visualHeight = vv?.height ?? window.innerHeight
  const offsetTop = vv?.offsetTop ?? 0
  return {
    visualHeight,
    layoutHeight: window.innerHeight,
    ...units,
    chromeHeight: Math.max(0, Math.round(units.large - units.small)),
    keyboardInset: Math.max(
      0,
      Math.round(window.innerHeight - (visualHeight + offsetTop)),
    ),
    offsetTop,
    scale: vv?.scale ?? 1,
    ...insets,
  }
}

export function useViewportChrome(): ViewportChrome {
  const [state, setState] = useState<ViewportChrome>(() => snapshot())

  useEffect(() => {
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setState(snapshot()))
    }
    const vv = window.visualViewport
    vv?.addEventListener("resize", update)
    vv?.addEventListener("scroll", update)
    window.addEventListener("resize", update)
    window.addEventListener("orientationchange", update)
    update()
    return () => {
      cancelAnimationFrame(frame)
      vv?.removeEventListener("resize", update)
      vv?.removeEventListener("scroll", update)
      window.removeEventListener("resize", update)
      window.removeEventListener("orientationchange", update)
    }
  }, [])

  return state
}
