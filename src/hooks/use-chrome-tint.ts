import { useEffect } from "react"

/**
 * Keeps the browser's own chrome in step with the page.
 *
 * Safari 26 ignores `<meta name="theme-color">` entirely. Its floating,
 * translucent toolbar derives a tint from CSS instead: the `background-color`
 * and `backdrop-filter` of `position: fixed` or `sticky` elements near the
 * viewport edges, falling back to the root background colour. A WebGL canvas
 * exposes no `background-color`, so a shader-backed page gives Safari nothing
 * to read and it falls back to the stylesheet default, which is white.
 *
 * Painting the real scene colour onto the root fixes that, and Chromium still
 * honours `theme-color`, so both engines end up tinted from the same value.
 */
export function useBrowserChromeTint(color: string, scheme: "light" | "dark") {
  useEffect(() => {
    const root = document.documentElement
    root.style.backgroundColor = color
    document.body.style.backgroundColor = color
    // Matches Safari's form controls, scrollbars and overscroll gutter.
    root.style.colorScheme = scheme

    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (!meta) {
      meta = document.createElement("meta")
      meta.name = "theme-color"
      document.head.appendChild(meta)
    }
    meta.content = color
  }, [color, scheme])
}
