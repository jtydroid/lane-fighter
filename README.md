# Lane Fighter

A tiny LCD-handheld-style space shooter. Move between 5 lanes, shoot the enemies coming down them, and don't let any slip past.

The rules will change over time by audience vote. The real purpose of the project is to exercise build and deploy automation at scale.

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

1. Merge a PR that bumps `"version"` in `package.json` (e.g. to `0.2.0`).
2. Tag that commit on `main`:

   ```bash
   gh release create v0.2.0 --target main --generate-notes
   ```

The tag push triggers a deploy that adds `/v/v0.2.0/` next to the older releases.

## CI/CD

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `ci.yml` | Pull requests, pushes to non-main branches | Tests, builds the whole site, smoke-checks every version |
| `deploy.yml` | Push to `main`, push of a `v*` tag, manual | Tests → builds → deploys to GitHub Pages → smoke-checks every version on the **live** URL until each serves its expected commit |

`main` is protected: changes land through PRs that pass CI, squash-merged.

Each build stamps `<release>+<short sha>` onto the faceplate and writes `version.json`. The site root also gets `releases.json`, which lists every frozen release and its variants; the version picker reads it.

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
| `scripts/check-site.js` | Smoke check: page, full module graph, expected commit. |
| `test/` | `node --test` suite. |

## Controls

↑/↓ or W/S move · Space/Z/J fire · Enter/P/Esc pause · M sound. On-screen buttons work on touch devices.
