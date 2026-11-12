# @srrhh/api

API del monorepo SRRHH.

## Tests

- `pnpm --filter @srrhh/api test` — suite unitaria (vitest run). No requiere server ni BD.
- `pnpm --filter @srrhh/api test:http` — tests de integración HTTP (`*.http.test.ts`). Requieren el stack levantado: API en `http://localhost:3000` y Dotaneitor en `http://localhost:5001` (configurables con `TEST_API_URL` / `TEST_DOTANEITOR_URL`).
