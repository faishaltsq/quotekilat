import { useEffect, useRef } from 'react'

/** Decorative only: no quote content, network calls, or input interception. */
export function HeroParallaxLayers() {
  const layersRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const layers = layersRef.current
    if (!layers) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const mobile = window.matchMedia('(max-width: 768px)')
    let frame: number | null = null
    let listening = false

    const updatePosition = () => {
      frame = null
      const bounds = layers.parentElement?.getBoundingClientRect()
      if (!bounds || bounds.bottom <= 0 || bounds.top >= window.innerHeight) return

      const progress = Math.min(1, Math.max(0, -bounds.top / Math.max(bounds.height, 1)))
      // Near sheet travels at most 56px; the other sheets use smaller CSS factors.
      layers.style.setProperty('--qk-parallax', `${progress * 56}px`)
    }

    const queueFrame = () => {
      if (frame === null) frame = window.requestAnimationFrame(updatePosition)
    }

    const stop = () => {
      if (listening) {
        window.removeEventListener('scroll', queueFrame)
        window.removeEventListener('resize', queueFrame)
        listening = false
      }
      if (frame !== null) {
        window.cancelAnimationFrame(frame)
        frame = null
      }
      layers.style.removeProperty('--qk-parallax')
    }

    const syncPreferences = () => {
      stop()
      if (reducedMotion.matches || mobile.matches) return
      window.addEventListener('scroll', queueFrame, { passive: true })
      window.addEventListener('resize', queueFrame, { passive: true })
      listening = true
      queueFrame()
    }

    reducedMotion.addEventListener('change', syncPreferences)
    mobile.addEventListener('change', syncPreferences)
    syncPreferences()

    return () => {
      stop()
      reducedMotion.removeEventListener('change', syncPreferences)
      mobile.removeEventListener('change', syncPreferences)
    }
  }, [])

  return (
    <div className="qk-hero-layers" ref={layersRef} aria-hidden="true">
      {[1, 2, 3, 4, 5, 6].map((sheet) => (
        <svg
          className={`qk-invoice-sheet qk-invoice-sheet-${sheet}`}
          key={sheet}
          viewBox="0 0 180 228"
          fill="none"
          focusable="false"
        >
          <rect x="1" y="1" width="178" height="226" rx="12" fill="currentColor" fillOpacity=".1" />
          <rect x="1" y="1" width="178" height="226" rx="12" stroke="currentColor" />
          <path d="M24 32h58M24 43h38M24 69h132M24 176h132" stroke="currentColor" strokeWidth="2" />
          <path
            d="M24 92h69m33 0h30M24 113h51m51 0h30M24 134h61m41 0h30M104 195h52"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </svg>
      ))}
    </div>
  )
}
