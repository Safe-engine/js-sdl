# SafeX SDL Living Task List
*Last Updated: 2026-09-13*

---

## Sprint 1 (v1.3.3 - v1.3.4 Maintenance & Quality Gates)
- [x] Unify monorepo workspace with `pnpm-workspace.yaml`.
- [x] Standardize project documentation conforming to SGM layout (`docs/plan`, `docs/todo`, etc.).
- [x] Document Semantic Versioning guidelines and GitHub Flow PR rules.
- [x] Fix `ComponentX.addComponent` auto-node creation regression.
- [ ] Refactor unit test suites to isolate `mock.module('sdl3')` from global leaks during bulk test runs.
- [ ] Add unit tests for `PersistenceJSON` schema migrations (`tests/persistence.test.ts`).
- [ ] Verify WebGL canvas context recovery on mobile orientation switch.
- [ ] Review memory leaks during rapid scene reload (`loadScene(Loading)` -> `loadScene(Game)`).

## Sprint 2 (v1.4.0 Milestone Delivery)
- [ ] Implement `AssetManager.loadBundle(name, onProgress)` API.
- [ ] Integrate bundle manifest validator.
- [ ] Benchmark QuickJS microtask queue drain rate under heavy promise chains.
- [ ] Draft initial `Camera2D` follow-target specification.
