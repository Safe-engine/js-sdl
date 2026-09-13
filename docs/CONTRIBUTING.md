# GitHub Flow & Pull Request Contribution Guidelines
*Governing Code Review, Branching, and Quality Gates for SafeX*

---

## 1. Branching Strategy: GitHub Flow

All SafeX development operates strictly on **GitHub Flow**:

```
[ main ] ───────────────────────────────────────────► [ main ]
   │                                                     ▲
   └──► [ feature/branch ] ──► [ PR Review & CI ] ───────┘
```

1. **`main` is Always Deployable**: Code merged into `main` must compile, pass tests, and remain production-ready.
2. **Feature Branches**: Branch directly off latest `main`:
   - `feature/<name>`: New functionality (e.g., `feature/bundle-manifest`)
   - `bugfix/<issue>`: Bug repairs (e.g., `bugfix/textinput-focus-blur`)
   - `refactor/<name>`: Code restructuring without functional changes
   - `docs/<name>`: Documentation additions

---

## 2. Pull Request (PR) Lifecycle

### Step 1: Create Branch & Commit Atomically
```bash
git checkout -b feature/asset-bundle-streaming
# Make changes...
git add engine/AssetManager.ts
git commit -m "feat(asset): add loadBundle streaming interface"
```

### Step 2: Open Pull Request via GitHub CLI (`gh`)
```bash
gh pr create --title "feat(asset): add loadBundle streaming interface" --body "## Summary
- Implements hierarchical asset bundle loading.
- Closes #42.

## Verification
- Added unit tests in tests/bundle.test.ts.
- Tested live in DragonMerge."
```

### Step 3: Peer Code Review & Verification Gates
Before any PR can be merged into `main`:
- [ ] **Automated CI**: Must pass lint checks and automated unit tests.
- [ ] **One Code Review Approval**: At least one senior maintainer review approval.
- [ ] **Linear History**: Rebase against `origin/main` if merge conflicts exist. Prefer **Squash and Merge** or **Rebase and Merge**.
