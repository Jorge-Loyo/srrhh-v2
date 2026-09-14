import { defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: {
    tsconfigRaw: { compilerOptions: { target: 'ES2022', module: 'commonjs', moduleResolution: 'node' } },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/app.ts'],
    },
  },
})
