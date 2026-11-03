import { defineConfig, configDefaults } from 'vitest/config'

export default defineConfig({
  esbuild: {
    tsconfigRaw: { compilerOptions: { target: 'ES2022', module: 'commonjs', moduleResolution: 'node' } },
  },
  test: {
    globals: true,
    environment: 'node',
    // src/**: suite de la API. scripts/**: tests de los scripts de ingesta
    // (carga-concursos) que viven fuera de src/ para no entrar al rootDir del
    // type-check (apps/api/tsconfig.json tiene rootDir: ./src).
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    // Los *.http.test.ts son tests de integración que golpean el stack real
    // (API en localhost:3000 + Dotaneitor en localhost:5001). Se excluyen del
    // `test` por defecto para que la suite unitaria quede verde sin server/BD.
    // Correrlos a propósito con: pnpm --filter @srrhh/api test:http
    // (requiere el stack levantado).
    exclude: [...configDefaults.exclude, '**/*.http.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/app.ts'],
    },
  },
})
