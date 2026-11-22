// Smoke-check a running copy of the site: the page loads, every JS module it
// imports (transitively) is served, and the deployed build is the expected one.
//
// Usage: node scripts/check-site.js <base-url> [--expect-sha <sha>] [--retries N]
//
// Retries let it wait out CDN propagation right after a deploy.

const args = process.argv.slice(2);
const base = (args[0] || '').replace(/\/?$/, '/');
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const expectSha = opt('--expect-sha', '').slice(0, 7);
const retries = Number(opt('--retries', 0));

if (!/^https?:\/\//.test(base)) {
  console.error('Usage: node scripts/check-site.js <base-url> [--expect-sha <sha>] [--retries N]');
  process.exit(2);
}

async function get(path) {
  const url = new URL(path, base);
  url.searchParams.set('cb', Date.now()); // bypass caches
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status} ${url.pathname}`);
  return res.text();
}

async function check() {
  const html = await get('');
  if (!html.includes('id="screen"')) throw new Error('index.html is missing the game canvas');
  if (!html.includes('href="style.css"')) throw new Error('index.html is missing style.css');
  await get('style.css');

  // Walk the ES module graph from the entry point.
  const entry = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/)?.[1];
  if (!entry) throw new Error('No module entry script in index.html');
  const seen = new Set();
  const queue = [new URL(entry, base).pathname.slice(new URL(base).pathname.length)];
  while (queue.length) {
    const path = queue.shift();
    if (seen.has(path)) continue;
    seen.add(path);
    const src = await get(path);
    for (const [, spec] of src.matchAll(/^\s*import\s[^'"]*['"](\.[^'"]+)['"]/gm)) {
      queue.push(new URL(spec, new URL(path, 'http://x/')).pathname.slice(1));
    }
  }

  let build = null;
  if (expectSha) {
    build = JSON.parse(await get('version.json'));
    if (build.sha !== expectSha) {
      throw new Error(`Live build is ${build.sha}, expected ${expectSha}`);
    }
  }
  return { modules: seen.size, build };
}

for (let attempt = 0; ; attempt++) {
  try {
    const { modules, build } = await check();
    console.log(`OK ${base} (${modules} modules${build ? `, ${build.version}` : ''})`);
    break;
  } catch (err) {
    if (attempt >= retries) {
      console.error(`FAIL ${base}: ${err.message}`);
      process.exit(1);
    }
    console.log(`Not ready (${err.message}), retrying in 10s…`);
    await new Promise((r) => setTimeout(r, 10_000));
  }
}
