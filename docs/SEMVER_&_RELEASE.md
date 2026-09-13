# Semantic Versioning & Release Policy
*Governing `@safe-engine/sdl` and SafeX Packages*

---

## 1. Semantic Versioning Specification (`MAJOR.MINOR.PATCH`)

SafeX strictly adheres to [Semantic Versioning 2.0.0](https://semver.org/):

```
v MAJOR . MINOR . PATCH
    │       │       └── Backward-compatible bug fixes & internal optimizations
    │       └────────── Backward-compatible new features, API additions
    └────────────────── Incompatible API changes, breaking architectural shifts
```

### Categorization Rules:

| Version Component | Trigger Criteria | Examples |
| :--- | :--- | :--- |
| **PATCH** (`1.3.x` -> `1.3.y`) | - Bug fixes that do not alter public API signatures.<br>- Performance optimizations.<br>- Internal documentation and type definition fixes. | Fixing memory leak in `PersistenceJSON`, fixing coordinate rounding in `Widget`. |
| **MINOR** (`1.3.x` -> `1.4.0`) | - New public engine classes or helper utilities.<br>- Deprecating existing methods without removing them.<br>- Upgrading internal dependency versions (e.g. SDL3 minor update). | Introducing `AssetManager.loadBundle()`, adding `Camera2D`. |
| **MAJOR** (`1.x.x` -> `2.0.0`) | - Breaking changes in `Engine.start()`, `Scene` lifecycle, or node transform hierarchy.<br>- Removal of deprecated APIs.<br>- Paradigm shift (e.g. full 3D RHI overhaul). | Reworking `Scene.__view()` compiler signature or replacing rendering core. |

---

## 2. Release & Tagging Process

1. **Verification Gate**: All tests must pass (`bun test tests`), linter clean (`pnpm run fix`).
2. **Version Bump**: Bump version in `js-sdl/package.json` following SemVer rules.
3. **Changelog Entry**: Update `docs/progress/` and release notes.
4. **Git Tagging**: Create an annotated git tag:
   ```bash
   git tag -a v1.3.3 -m "Release v1.3.3: memory optimizations and workspace integration"
   git push origin v1.3.3
   ```
5. **NPM Publication**:
   ```bash
   pnpm publish --access public
   ```
