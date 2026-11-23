// Build the whole site: the current checkout as "latest" at the root, plus
// every release tag (v*) frozen under v/<tag>/, each built from its own code.
//
// Usage: node scripts/build-all.js [--out DIR]
// Needs the git tags locally (in CI: actions/checkout with fetch-depth: 0).
// $BUILD_ID (CI sets it to the run id) is stamped into releases.json so a
// check of the live site can tell this build from an older one of the same commit.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const OUT = resolve(outIdx >= 0 ? args[outIdx + 1] : join(ROOT, '_site'));

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
const node = (...a) => execFileSync(process.execPath, a, { stdio: 'inherit' });
const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));

// 1. Latest: the current checkout, at the site root.
const headSha = git('rev-parse', 'HEAD');
node(join(ROOT, 'scripts', 'build.js'), '--out', OUT, '--sha', headSha);
const latest = await readJson(join(OUT, 'version.json'));

// 2. Frozen releases, newest first.
const TAG_RE = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const tags = git('tag', '--list', 'v*', '--sort=-v:refname').split('\n').filter(Boolean);
const releases = [];

for (const tag of tags) {
  if (!TAG_RE.test(tag)) {
    console.warn(`Skipping ${tag}: not a vMAJOR.MINOR.PATCH tag`);
    continue;
  }
  const src = await mkdtemp(join(tmpdir(), `lanefighter-${tag}-`));
  try {
    const archive = execFileSync('git', ['archive', '--format=tar', tag], { cwd: ROOT, maxBuffer: 1 << 28 });
    execFileSync('tar', ['-x', '-C', src], { input: archive });
    const buildScript = join(src, 'scripts', 'build.js');
    if (!existsSync(buildScript)) {
      console.warn(`Skipping ${tag}: it has no scripts/build.js`);
      continue;
    }
    const sha = git('rev-list', '-n', '1', tag);
    const out = join(OUT, 'v', tag);
    node(buildScript, '--out', out, '--sha', sha, '--release', tag);
    if (!existsSync(join(out, 'version.json'))) {
      console.warn(`Skipping ${tag}: its build script does not support --out`);
      await rm(out, { recursive: true, force: true });
      continue;
    }
    const info = await readJson(join(out, 'version.json'));
    releases.push({ release: tag, version: info.version, sha: info.sha, variants: info.variants });
  } finally {
    await rm(src, { recursive: true, force: true });
  }
}

await writeFile(
  join(OUT, 'releases.json'),
  JSON.stringify({ build: process.env.BUILD_ID || `local-${Date.now()}`, latest, releases }, null, 2) + '\n',
);
console.log(`Site built: latest ${latest.version} + ${releases.length} frozen release(s)`);
