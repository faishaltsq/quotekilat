import { render } from '@testing-library/react'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HeroParallaxLayers } from './HeroParallaxLayers'

function setMediaPreference(reducedMotion: boolean, mobile = false) {
  const queries: MediaQueryList[] = []
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
    const result = {
      matches: query.includes('reduced-motion') ? reducedMotion : mobile,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList
    queries.push(result)
    return result
  })
  return queries
}

afterEach(() => vi.unstubAllGlobals())

describe('HeroParallaxLayers', () => {
  it('keeps exactly six decorative sheets outside the accessibility tree', () => {
    setMediaPreference(true)
    const { container } = render(<HeroParallaxLayers />)
    const decoration = container.querySelector('.qk-hero-layers')
    expect(decoration).toHaveAttribute('aria-hidden', 'true')
    expect(decoration?.querySelectorAll('svg')).toHaveLength(6)
    expect(container.querySelectorAll('a, button, input')).toHaveLength(0)
  })

  it.each([
    ['reduced motion', true, false],
    ['mobile', false, true],
  ] as const)('does not schedule animation for %s', (_label, reduced, mobile) => {
    setMediaPreference(reduced, mobile)
    const frame = vi.fn()
    vi.stubGlobal('requestAnimationFrame', frame)
    render(<HeroParallaxLayers />)
    expect(frame).not.toHaveBeenCalled()
  })

  it('bounds scroll displacement and removes it when reduced motion is enabled', () => {
    const queries = setMediaPreference(false)
    let queuedFrame: FrameRequestCallback | undefined
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      queuedFrame = callback
      return 42
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const view = render(<HeroParallaxLayers />)
    const layers = view.container.querySelector<HTMLElement>('.qk-hero-layers')!
    let top = -600
    vi.spyOn(view.container, 'getBoundingClientRect').mockImplementation(
      () => new DOMRect(0, top, 1440, 1200),
    )
    act(() => queuedFrame?.(0))
    expect(layers.style.getPropertyValue('--qk-parallax')).toBe('28px')

    top = -1199
    window.dispatchEvent(new Event('scroll'))
    act(() => queuedFrame?.(0))
    const displacement = Number.parseFloat(layers.style.getPropertyValue('--qk-parallax'))
    expect(displacement).toBeGreaterThan(0)
    expect(displacement).toBeLessThanOrEqual(56)

    Object.defineProperty(queries[0], 'matches', { value: true })
    const onPreferenceChange = vi.mocked(queries[0].addEventListener).mock.calls[0][1] as () => void
    act(() => onPreferenceChange())
    expect(layers.style.getPropertyValue('--qk-parallax')).toBe('')
    view.unmount()
  })

  it('uses a passive scroll listener and cleans up frames and media listeners', () => {
    const queries = setMediaPreference(false)
    const frame = vi.fn().mockReturnValue(42)
    const cancel = vi.fn()
    vi.stubGlobal('requestAnimationFrame', frame)
    vi.stubGlobal('cancelAnimationFrame', cancel)
    const listen = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const view = render(<HeroParallaxLayers />)

    expect(listen).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true })
    expect(frame).toHaveBeenCalledTimes(1)
    view.unmount()
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function))
    expect(cancel).toHaveBeenCalledWith(42)
    for (const query of queries) {
      expect(query.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
    }
  })
})
