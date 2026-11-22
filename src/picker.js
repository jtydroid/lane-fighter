// Version + rules pickers under the device.
//
// Site layout (see scripts/build-all.js):
//   <site root>/                 latest build of main
//   <site root>/v/<tag>/         frozen release
//   <site root>/releases.json    list of frozen releases

import { VARIANTS, DEFAULT_VARIANT } from './variants.js';

export function siteRoot(loc = location) {
  const path = loc.pathname
    .replace(/\/v\/[^/]+\/[^/]*$/, '/') // inside a frozen release
    .replace(/[^/]*$/, ''); // drop a trailing file name
  return new URL(path, loc.origin);
}

export function setupPicker(variant) {
  const variantSelect = document.getElementById('variant-select');
  const releaseSelect = document.getElementById('release-select');
  document.getElementById('variant-desc').textContent = variant.description;

  for (const [id, v] of Object.entries(VARIANTS)) {
    variantSelect.add(new Option(v.name, id, false, id === variant.id));
  }
  variantSelect.addEventListener('change', () => {
    const url = new URL(location.href);
    if (variantSelect.value === DEFAULT_VARIANT) url.searchParams.delete('variant');
    else url.searchParams.set('variant', variantSelect.value);
    location.assign(url);
  });

  const root = siteRoot();
  fetch(new URL('releases.json', root), { cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(res.status))))
    .then(({ latest, releases }) => {
      releaseSelect.replaceChildren(new Option(`Latest (${latest.version})`, root.href));
      for (const r of releases) {
        releaseSelect.add(new Option(r.release, new URL(`v/${r.release}/`, root).href));
      }
      const here = new URL('./', location.href).href;
      releaseSelect.value = [...releaseSelect.options].some((o) => o.value === here) ? here : root.href;
      releaseSelect.addEventListener('change', () => {
        // Keep the chosen variant; releases that lack it fall back to classic.
        location.assign(releaseSelect.value + location.search);
      });
    })
    .catch(() => {
      // No releases.json (e.g. plain `npm start`): only the rules picker is useful.
      releaseSelect.closest('label').hidden = true;
    });
}
