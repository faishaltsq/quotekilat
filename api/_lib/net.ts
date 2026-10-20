/** AbortSignal.timeout is missing on older runtimes and in the test environment. */
export function timeoutSignal(ms: number): AbortSignal | undefined {
  return typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(ms) : undefined
}
