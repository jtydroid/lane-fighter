# Lane Fighter

A tiny LCD-handheld-style space shooter. Move between 5 lanes, shoot the enemies coming down them, and don't let any slip past.

The rules will change over time by audience vote. The real purpose of the project is to exercise build and deploy automation at scale.

## Enemies

| Enemy | Rules | Behaviour |
| --- | --- | --- |
| Fighter | all | One cell, one hit, 1 point. |
| Heavy cruiser | all (from v0.2.0) | Spans two lanes, takes 3 hits (its lit windows count down), 3 points. |
| Gunship | **Gunner** (from v0.4.0) | Appears from 15 points. Its muzzle flashes (`<`) for 3 ticks, then it fires a bullet back up its lane. Step out of the lane, or shoot the bullet down. One hit, 2 points. |

## Bombs

From v0.7.0, every game starts with **3 bombs** (B or X key, or the BOMB button). A bomb deals 2 hits to every enemy on screen and wipes out enemy bullets. Fighters and gunships are destroyed, and a full-health heavy cruiser is left on its last hit. Destroyed enemies score as usual. Bombs don't refill when you lose a ship. The count, damage and bullet-clearing are all rules (`bombs`, `bombHits`, `bombClearsBullets`).

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
| `?variant=<id>` | **Rule preset** within any of the above, e.g. `/v/v0.1.0/?variant=warp` |
| `?<rule>=<value>` | **Custom rules** on top of the preset, e.g. `?variant=gunner&enemyMinStepTicks=4` (from v0.5.0) |

`v0.1.0` is the preserved base game. High scores are kept separately per release and preset, and every different set of custom rules gets its own table.

### Rules panel

Under the device, the **Rules** panel shows every rule in `src/rules.js` on five tabs: Speed, Player, Enemies, Heavy cruisers and Gunships. Pick a preset (a variant) to fill them all in, change any value, and **Apply & restart**. The changes go into the URL, so **Copy link** shares that exact game. Values are checked with the same ranges as `validateRules`, and invalid combinations show an error instead of applying.

Labels, tabs and help text live in `src/rule-meta.js`. A test fails if a rule in `rules.js` isn't on a tab, so a newly voted-in rule always needs an entry there.

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

## Balance

`npm run balance` estimates how hard each preset is for a person. It plays 300 games per preset with a simulated player that has human limits:
- it sees the board 3 ticks (300 ms) late;
- it presses at most once every 2 ticks (5 presses a second);
- it hesitates 10% of the time.

It's calibrated to a real player, who reached about 55 points on the old Classic speed ramp (v0.5.0) before it became unplayable. The simulated player gets a median of 56 there. A test keeps it calibrated.

```bash
npm run balance                                           # every preset
npm run balance -- --preset gunner                        # one preset
npm run balance -- --set speedupEveryPoints=15            # try a rule change before voting on it
npm run balance -- --react 4 --gap 3                      # a slower player
```

Medians as of v0.6.0, from 300 games per preset:

| Preset | Old ramp (v0.5.0) | v0.6.0 |
| --- | --- | --- |
| Classic | 56 | 119 |
| Warp | 70 | 213 |
| Gunner | 53 | 90 |

The simulated player uses a bomb when two enemies are about to get past in other lanes, or when it can't dodge a bullet. With v0.7.0's 3 bombs the medians are Classic 129, Warp 235 and Gunner 109.

Use it to compare rule sets, not to predict any one person's score.

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
| `src/picker.js` | Version picker. |
| `src/rules-panel.js` | The rules panel: presets, tabs, editing, apply, share. |
| `src/rule-meta.js` | Each rule's tab, label and help text for the panel. |
| `src/custom-rules.js` | Custom rules in the URL: parsing, checking, high-score keys. |
| `src/main.js` | Wires it together; fixed-timestep loop. Exposes `window.__game` / `window.__variant`. |
| `src/version.js` | Release + version shown on the faceplate; stamped by the build. |
| `scripts/build.js` | Builds one copy of the game. Old releases are rebuilt with their own copy, so keep its flags stable. |
| `scripts/build-all.js` | Builds latest + every release tag into `_site/`. |
| `scripts/check-site.js` | Smoke check: page, full module graph, expected commit and build. |
| `scripts/balance.js` | Simulated human player for comparing rule sets (`npm run balance`). |
| `scripts/release-plan.js` | Prints the tag to release if `package.json`'s version is new. |
| `test/` | `node --test` suite. |

## Controls

↑/↓ or W/S move · Space/Z/J fire · B/X bomb · Enter/P/Esc pause · M sound. On-screen buttons work on touch devices.
