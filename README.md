# Lane Fighter

A tiny LCD-handheld-style space shooter. Move between 5 lanes, shoot the enemies coming down them, and don't let any slip past.

The rules will change over time by audience vote. The real purpose of the project is to exercise build and deploy automation at scale.

## Run

```bash
npm start        # http://localhost:8080
npm test         # engine tests (Node 20+, no dependencies)
```

```bash
npm run build                          # assemble _site/ with a stamped version
npm run check -- http://localhost:8080/  # smoke-check any running copy
```

## CI/CD

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `ci.yml` | Pull requests, pushes to non-main branches | Tests, builds, smoke-checks the build |
| `deploy.yml` | Push to `main`, manual | Tests → builds → deploys to GitHub Pages → smoke-checks the **live** URL until it serves this commit |

The build stamps `v<package version>+<short sha>` onto the faceplate and writes `version.json` (`version`, `sha`, `run`, `builtAt`). The live check reads `version.json`, so a deploy only counts as successful once players are actually getting the new build.

To ship a rule change, open a PR that edits `src/rules.js`. CI validates it, and merging deploys it.

## Layout

| File | Role |
| --- | --- |
| `src/rules.js` | **Every tunable rule.** Most voted changes should be a diff to this file. |
| `src/engine.js` | Pure, seeded, deterministic game logic (no DOM). `validateRules` guards `rules.js`. |
| `src/render.js` | Canvas LCD renderer (ghost segments, 7-segment digits). |
| `src/input.js` | Keyboard + touch buttons → `up` / `down` / `fire` / `start` / `mute`. |
| `src/sound.js` | Piezo-style beeps. |
| `src/main.js` | Wires it together; fixed-timestep loop. Exposes `window.__game` for smoke tests. |
| `src/version.js` | Version shown on the faceplate; CI can stamp it per build. |
| `test/` | `node --test` suite. |

## Controls

↑/↓ or W/S move · Space/Z/J fire · Enter/P/Esc pause · M sound. On-screen buttons work on touch devices.
