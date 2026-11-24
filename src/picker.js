// Version picker under the device. (The rules preset picker is part of the
// rules panel, rules-panel.js.)
//
// Site layout (see scripts/build-all.js):
//   <site root>/                 latest build of main
//   <site root>/v/<tag>/         frozen release
//   <site root>/releases.json    list of frozen releases

export function siteRoot(loc = location) {
  const path = loc.pathname
    .replace(/\/v\/[^/]+\/[^/]*$/, '/') // inside a frozen release
    .replace(/[^/]*$/, ''); // drop a trailing file name
  return new URL(path, loc.origin);
}

export function setupPicker() {
  const releaseSelect = document.getElementById('release-select');

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
        // Keep the chosen rules. Releases that lack a preset fall back to
        // classic, and ignore rules they don't have.
        location.assign(releaseSelect.value + location.search);
      });
    })
    .catch(() => {
      // No releases.json (e.g. plain `npm start`): only the rules picker is useful.
      releaseSelect.closest('label').hidden = true;
    });
}
