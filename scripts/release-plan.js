// Decide whether this commit is a new release, from package.json's version.
//
// Usage: node scripts/release-plan.js
// Prints the tag to create (e.g. v0.4.0), or nothing if that version is already
// released. Fails if a tag with that name exists but is a different version
// (made by hand on a commit whose package.json says otherwise), since its name
// is taken and releases are immutable.
//
// Needs the git tags locally (in CI: actions/checkout with fetch-depth: 0).

import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

const { version } = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
const tag = `v${version}`;

let tagged;
try {
  tagged = JSON.parse(git('show', `refs/tags/${tag}:package.json`)).version;
} catch {
  tagged = null; // no such tag: this is a new release
}

if (tagged === null) {
  console.log(tag);
} else if (tagged !== version) {
  console.error(
    `Tag ${tag} already exists, but its package.json says ${tagged}. ` +
      'That name is taken; bump package.json to a version that has no tag yet.',
  );
  process.exit(1);
}
// else: already released, print nothing
