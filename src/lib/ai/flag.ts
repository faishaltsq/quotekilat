/** Smart Input ships dark: without the flag the panel never mounts and no
 *  network call exists in the bundle's reachable path. */
export const smartInputEnabled = import.meta.env.VITE_FEATURE_AI_PARSE === 'true'
