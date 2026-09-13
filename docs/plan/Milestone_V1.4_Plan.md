# Milestone v1.4.0 Release Plan
*Package: `@safe-engine/sdl`*  
*Target Timeline: 2026-Q4*

---

## 1. Objectives
1. **Asset Bundle Subsystem**: Replace flat asset loading with hierarchical, content-hashed bundles (`AssetManager.loadBundle()`).
2. **Camera2D Enhancement**: Add deadzone tracking, smooth follow, and multi-layer parallax support for RPG & HOPA genres.
3. **PPM / Zero-allocation Math**: Pool common vector and transform calculations to prevent garbage collection spikes.
4. **SDL_GPU Preparation**: Lay abstract interfaces for hardware compute and shader passes in native mode.

---

## 2. Feature Breakdown & Tracking

| Feature | Component | Priority | Status | Assignee |
| :--- | :--- | :---: | :---: | :--- |
| Hierarchical Asset Bundles | `engine/AssetManager.ts` | P0 | In Progress | Engine Core |
| Camera2D Parallax Layers | `engine/Viewport.ts` | P1 | Planned | Engine Core |
| Texture Atlas Memory Auto-evict | `engine/SpriteFrameCache.ts` | P1 | Planned | Runtime Team |
| Native QuickJS Event Loop Polish | `src/js_sdl3.c` | P0 | Planned | Native C Team |
| Vitest Headless Browser Suite | `tests/` | P1 | In Progress | QA Team |
