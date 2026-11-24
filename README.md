# Lane Fighter

A tiny LCD-handheld-style space shooter. Move between 5 lanes, shoot the enemies coming down them, and don't let any slip past.

The rules will change over time by audience vote. The real purpose of the project is to exercise build and deploy automation at scale.

## Enemies

| Enemy | Rules | Behaviour |
| --- | --- | --- |
| Fighter | all | One cell, one hit, 1 point. |
| Heavy cruiser | all (from v0.2.0) | Spans two lanes, takes 3 hits (its lit windows count down), 3 points. |
| Gunship | **Gunner** (from v0.4.0) | Appears from 15 points. Its muzzle flashes (`<`) for 3 ticks, then it fires a bullet back up its lane. Step out of the lane, or shoot the bullet down. One hit, 2 points. |

## Run

```bash
npm start        # http://localhost:8080 (the working copy)
npm test         # tests (Node 20+, no dependencies)
```

```bash
npm run build                                          # whole site into _site/: latest + every release tag
node scripts/serve.js 8093 _site                       # serve it
npm run check -- http://localhost:8093/ --all-releases # smoke-check every version
```

## Versions and variants

The live site serves several games side by side:

| URL | What |
| --- | --- |
| `/` | **Latest**: the current `main` |
| `/v/<tag>/` | **Frozen release**: every `v*` git tag, built from *that tag's own code* and kept forever |
| `?variant=<id>` | **Rule variant** within any of the above, e.g. `/v/v0.1.0/?variant=warp` |

`v0.1.0` is the preserved base game. Players switch with the Version and Rules pickers under the device. High scores are kept separately per release and variant.

**Release tags are protected**: once pushed, a `v*` tag can't be moved or deleted, so a frozen release can't change.

### Add a rule variant

Add an entry to `src/variants.js` with only the rules it changes:

```js
turbo: { name: 'Turbo', description: 'Everything is faster.', overrides: { tickMs: 60 } },
```

`classic` (no overrides) is always exactly `src/rules.js`. Tests reject variants that override unknown rules or produce invalid ones.

### Cut a release

Merge a PR that bumps `"version"` in `package.json` (e.g. to `0.4.0`). That's all.

The deploy run for that merge sees a version with no tag yet. It builds the version as `/v/v0.4.0/` next to the older releases, deploys and checks the live site. Only then does it create the `v0.4.0` tag and GitHub release.

Don't tag releases by hand: Pages won't redeploy a commit it already has, so a hand-made tag on `main`'s current commit can't publish on its own. A version whose tag name is already taken (like `v0.3.0`, which was tagged by hand on the `v0.2.0` code) fails the deploy, so pick the next unused one.

## CI/CD

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `ci.yml` | Pull requests, pushes to non-main branches | Tests, builds the whole site, smoke-checks every version |
| `deploy.yml` | Push to `main`, manual | Tests → builds → deploys to GitHub Pages → smoke-checks every version on the **live** URL until it serves this run's build → tags and publishes the release if `package.json`'s version is new |

`main` is protected: changes land through PRs that pass CI, squash-merged.

Each build stamps `<release>+<short sha>` onto the faceplate and writes `version.json`. The site root also gets `releases.json`, which lists every frozen release and its variants; the version picker reads it.

Every deploy run has a unique build ID (`<run id>-<attempt>`), stamped into `releases.json`. The live check waits for it. If Pages skipped the deploy because it already had that commit (for example, a manual re-run with nothing new), the check fails instead of passing on the old site.

## Layout

| File | Role |
| --- | --- |
| `src/rules.js` | **The base rules.** Voted changes to the main game are diffs to this file. |
| `src/variants.js` | Named rule variants, each a set of overrides on top of `rules.js`. |
| `src/engine.js` | Pure, seeded, deterministic game logic (no DOM). `validateRules` guards rules. |
| `src/render.js` | Canvas LCD renderer (ghost segments, 7-segment digits). |
| `src/input.js` | Keyboard + touch buttons → `up` / `down` / `fire` / `start` / `mute`. |
| `src/sound.js` | Piezo-style beeps. |
| `src/picker.js` | Version and rules pickers. |
| `src/main.js` | Wires it together; fixed-timestep loop. Exposes `window.__game` / `window.__variant`. |
| `src/version.js` | Release + version shown on the faceplate; stamped by the build. |
| `scripts/build.js` | Builds one copy of the game. Old releases are rebuilt with their own copy, so keep its flags stable. |
| `scripts/build-all.js` | Builds latest + every release tag into `_site/`. |
| `scripts/check-site.js` | Smoke check: page, full module graph, expected commit and build. |
| `scripts/release-plan.js` | Prints the tag to release if `package.json`'s version is new. |
| `test/` | `node --test` suite. |

## Controls

↑/↓ or W/S move · Space/Z/J fire · Enter/P/Esc pause · M sound. On-screen buttons work on touch devices.
