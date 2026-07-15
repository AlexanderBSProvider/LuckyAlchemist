# Lucky Alchemist — project rules

Idle luck game about an alchemist mutating themselves. Full design doc:
[docs/GAME-DESIGN.md](docs/GAME-DESIGN.md). Development plan and current stage:
[docs/ROADMAP.md](docs/ROADMAP.md). Architecture rules: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

This project is also a learning vehicle for the owner. Every development step ships
with a paired lesson in `docs/course/` (see `docs/course/00-course-map.md`). When you
implement a step from the roadmap, write or update the matching lesson in the same
session — don't let code and course drift apart.

## Language

- Code, identifiers, comments, commit messages, CI, docs meant for other developers: **English**.
- `docs/course/**` (the learning material) and `docs/GAME-DESIGN.md`/`docs/ROADMAP.md`
  narrative sections: **Ukrainian**, since the owner is learning the stack in Ukrainian.

## Hard architectural rules

1. **`src/core/` is pure.** No DOM, no Three.js, no `Date.now()`/`setTimeout`, no `Math.random()`.
   All randomness flows through an injected `Rng` (see `src/core/rng.ts`). This is what
   makes core unit-testable and replayable by seed.
2. **No balance numbers in code.** Ingredient weights, prices, upgrade curves, stage
   tables — all in `src/data/*.json`, validated at the boundary with the Zod schemas in
   `src/data/schemas.ts`. Code reads data; it never hardcodes a tuning constant.
3. **Every formula that lands in `core/` ships with a unit test in the same PR/commit.**
   No exceptions — this is the safety net for AI-authored game math.
4. **Dependency direction is one-way:** `data → core → store → (platform | render | ui | audio)`.
   `core` and `store` never import from `render`, `ui`, `platform`, or `audio`.
5. **Feature build order:** core + tests → store wiring → UI → juice (particles/sound/animation).
   Never start with the visual layer.
6. **Economy sim in CI from Stage 1 onward.** Any change to `src/data/*.json` or
   `src/core/economy.ts`-family formulas must keep `npm run econ-sim` passing.
7. **Saves are versioned.** Any change to the save shape needs a migration in
   `src/core/save/migrations.ts` and a round-trip test. Never mutate an old schema in place.

## Commands

- `npm run dev` — Vite dev server.
- `npm run test` / `npm run test:watch` — Vitest.
- `npm run typecheck` — `tsc -b --noEmit` (project references).
- `npm run lint` / `npm run format` — ESLint flat config / Prettier.
- `npm run econ-sim` — runs `tools/econ-sim.ts` against `src/core`.
- `npm run build` — production build (bundle budget: ≤5 MB initial load, see ROADMAP).

## What's intentionally not here

React, Zustand — evaluated and rejected for this project (see plan history).
State management is a small hand-rolled store in `src/store/` — that's deliberate, not
a placeholder for "add a framework later".

Three.js *was* on this rejected list; the owner reversed that call once already to move
`render/` from PixiJS to Three.js (see
[docs/THREEJS-MIGRATION.md](docs/THREEJS-MIGRATION.md) for the rationale and the "variant A"
2.5D approach). **This branch (`render/pixi`) reverses it a second time**, back to PixiJS —
`main` stays on Three.js; this is a branch-scoped experiment, not a project-wide re-reversal
of the decision above. See [docs/ARCHITECTURE.md §6](docs/ARCHITECTURE.md) for the
architecture as it stands on this branch.
