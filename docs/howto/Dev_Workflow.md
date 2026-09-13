# Developer Workflow & Monorepo Setup Guide
*Target: Engine Contributors working on `@safe-engine/sdl`*

---

## 1. Setting Up the Workspace

SafeX now uses **pnpm workspaces** at the root of `safex/`:

```bash
# Navigate to safex root
cd G:/SGM/SGGame/OpenSources/safex

# Install all dependencies across the entire monorepo
pnpm install
```

---

## 2. Developing `@safe-engine/sdl` Locally

When making changes inside `js-sdl/engine/`:

```bash
# In one terminal, build or watch the engine:
cd G:/SGM/SGGame/OpenSources/safex/js-sdl
pnpm run compile --watch

# In another terminal, run an example game (e.g. DragonMerge)
cd G:/SGM/SGGame/OpenSources/safex/Examples/DragonMerge
pnpm run dev
```

Because `package.json` in `DragonMerge` references `@safe-engine/sdl`, pnpm links the local `js-sdl` package directly. Changes in the engine reflect immediately without publishing to npm!

---

## 3. Running Engine Tests & Linters

```bash
cd G:/SGM/SGGame/OpenSources/safex/js-sdl

# Run unit tests via Bun test runner
bun test tests

# Run code linter and auto-fix
pnpm run fix
```
