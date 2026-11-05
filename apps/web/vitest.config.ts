import { defineConfig } from 'vitest/config'

// Suite unitaria de apps/web. Hoy solo cubre lógica PURA (sin React/DOM), como
// grilla-permisos.ts, por eso environment: 'node' (no se monta jsdom). Si más
// adelante se testean componentes, cambiar a 'jsdom' y agregar @testing-library.
//
// Correr con: pnpm --filter @srrhh/web test
export default defineConfig({
  esbuild: {
    tsconfigRaw: { compilerOptions: { target: 'ES2022', module: 'esnext', moduleResolution: 'bundler', jsx: 'react-jsx' } },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
