import { defineConfig } from 'vitest/config'

// Config para los tests de INTEGRACIÓN HTTP (*.http.test.ts). Golpean el stack
// real (API en localhost:3000 + Dotaneitor en localhost:5001), por eso están
// excluidos del `test` por defecto (ver vitest.config.ts). Se corren a propósito
// con el stack levantado: pnpm --filter @srrhh/api test:http
export default defineConfig({
  esbuild: {
    tsconfigRaw: { compilerOptions: { target: 'ES2022', module: 'commonjs', moduleResolution: 'node' } },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.http.test.ts'],
  },
})
