import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
export default defineConfig({ plugins: [react()], test: { environment: 'jsdom', env: { NODE_ENV: 'test' }, setupFiles: ['./tests/setup.ts'], include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/components/**/*.test.tsx', 'src/**/*.test.{ts,tsx}'], restoreMocks: true } })
