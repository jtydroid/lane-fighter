// Smoke-check a running copy of the site: the page loads, every JS module it
// imports (transitively) is served, and the deployed build is the expected one.
//
// Usage: node scripts/check-site.js <base-url> [--expect-sha SHA] [--all-releases] [--retries N]
//   --expect-sha    fail unless the build at <base-url> is this commit
//   --all-releases  also check every frozen release listed in releases.json
//   --retries N     retry the whole check N times, 10s apart (waits out CDN propagation)

const args = process.argv.slice(2);
const base = (args[0] || '').replace(/\/?$/, '/');
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const expectSha = opt('--expect-sha', '').slice(0, 7);
const allReleases = args.includes('--all-releases');
const retries = Number(opt('--retries', 0));

if (!/^https?:\/\//.test(base)) {
  console.error('Usage: node scripts/check-site.js <base-url> [--expect-sha SHA] [--all-releases] [--retries N]');
  process.exit(2);
}

async function get(baseUrl, path) {
  const url = new URL(path, baseUrl);
  url.searchParams.set('cb', Date.now()); // bypass caches
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status} ${url.pathname}`);
  return res.text();
}

// Check one copy of the game rooted at baseUrl.
async function checkGame(baseUrl, sha) {
  const html = await get(baseUrl, '');
  if (!html.includes('id="screen"')) throw new Error(`${baseUrl}: index.html is missing the game canvas`);
  if (!html.includes('href="style.css"')) throw new Error(`${baseUrl}: index.html is missing style.css`);
  await get(baseUrl, 'style.css');

  // Walk the ES module graph from the entry point.
  const entry = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/)?.[1];
  if (!entry) throw new Error(`${baseUrl}: no module entry script in index.html`);
  const seen = new Set();
  const queue = [entry];
  while (queue.length) {
    const path = queue.shift();
    if (seen.has(path)) continue;
    seen.add(path);
    const src = await get(baseUrl, path);
    for (const [, spec] of src.matchAll(/^\s*import\s[^'"]*['"](\.[^'"]+)['"]/gm)) {
      queue.push(new URL(spec, new URL(path, 'http://x/')).pathname.slice(1));
    }
  }

  const build = JSON.parse(await get(baseUrl, 'version.json'));
  if (sha && build.sha !== sha.slice(0, 7)) {
    throw new Error(`${baseUrl}: live build is ${build.sha}, expected ${sha.slice(0, 7)}`);
  }
  return `${build.version} (${seen.size} modules)`;
}

async function check() {
  const lines = [`latest   ${await checkGame(base, expectSha)}`];
  if (allReleases) {
    const { releases } = JSON.parse(await get(base, 'releases.json'));
    for (const r of releases) {
      lines.push(`${r.release.padEnd(8)} ${await checkGame(new URL(`v/${r.release}/`, base), r.sha)}`);
    }
  }
  return lines;
}

for (let attempt = 0; ; attempt++) {
  try {
    const lines = await check();
    console.log(`OK ${base}\n  ${lines.join('\n  ')}`);
    break;
  } catch (err) {
    if (attempt >= retries) {
      console.error(`FAIL ${err.message}`);
      process.exit(1);
    }
    console.log(`Not ready (${err.message}), retrying in 10s…`);
    await new Promise((r) => setTimeout(r, 10_000));
  }
}
