// Publish this workflow run's "github-pages" artifact to GitHub Pages.
//
// This does what actions/deploy-pages does, with one difference: the deployment's
// build version is unique per run ($BUILD_ID), not the commit SHA. Pages skips a
// build version it has already deployed, so with the SHA a release tag on the
// commit main just deployed would "succeed" without publishing anything.
//
// Runs only inside a GitHub Actions job with `pages: write`, `id-token: write`
// and `actions: read`. Writes page_url to $GITHUB_OUTPUT.

import { appendFile } from 'node:fs/promises';

const env = (name) => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (run this inside a GitHub Actions job)`);
  return v;
};

const api = env('GITHUB_API_URL');
const repo = env('GITHUB_REPOSITORY');
const runId = env('GITHUB_RUN_ID');
const token = env('GITHUB_TOKEN');
const buildVersion = env('BUILD_ID');

async function call(method, path, body) {
  const res = await fetch(`${api}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...(body && { 'content-type': 'application/json' }),
    },
    body: body && JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

// 1. The artifact upload-pages-artifact made earlier in this run.
const { artifacts } = await call('GET', `/repos/${repo}/actions/runs/${runId}/artifacts?name=github-pages`);
const artifact = artifacts?.[0];
if (!artifact) throw new Error('No "github-pages" artifact in this run');

// 2. An OIDC token, which Pages requires to prove the deploy comes from this job.
const oidcRes = await fetch(env('ACTIONS_ID_TOKEN_REQUEST_URL'), {
  headers: { authorization: `Bearer ${env('ACTIONS_ID_TOKEN_REQUEST_TOKEN')}` },
});
if (!oidcRes.ok) throw new Error(`OIDC token request failed: ${oidcRes.status}`);
const { value: oidcToken } = await oidcRes.json();

// 3. Create the deployment and wait for it to go live.
const deployment = await call('POST', `/repos/${repo}/pages/deployments`, {
  artifact_id: artifact.id,
  pages_build_version: buildVersion,
  oidc_token: oidcToken,
});
console.log(`Created Pages deployment ${buildVersion} from artifact ${artifact.id}`);

const DONE = new Set(['succeed']);
const FAILED = new Set(['deployment_failed', 'deployment_content_failed', 'deployment_cancelled', 'deployment_lost', 'deployment_attempt_error']);
const deadline = Date.now() + 10 * 60_000;
let status = '';
while (!DONE.has(status)) {
  if (FAILED.has(status)) throw new Error(`Pages deployment ${buildVersion} ended with status "${status}"`);
  if (Date.now() > deadline) throw new Error(`Pages deployment ${buildVersion} timed out (last status "${status}")`);
  await new Promise((r) => setTimeout(r, 5_000));
  ({ status } = await call('GET', `/repos/${repo}/pages/deployments/${encodeURIComponent(buildVersion)}`));
  console.log(`  status: ${status}`);
}

const pageUrl = deployment.page_url || (await call('GET', `/repos/${repo}/pages`)).html_url;
console.log(`Live at ${pageUrl}`);
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `page_url=${pageUrl}\n`);
