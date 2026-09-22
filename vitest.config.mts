import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    // The domain and application layers are plain TypeScript. Nothing here
    // needs a DOM, and pretending otherwise only makes the suite slower.
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
})
