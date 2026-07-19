// Deploy to GitHub Pages — with verification and automatic retry.
//
// GitHub sometimes silently skips the Pages build after a push to gh-pages,
// leaving the live site on the old version. This script builds, publishes,
// then polls the live URL until the *new* bundle is actually served; if
// GitHub hasn't picked it up after a few minutes it pushes again (a fresh
// commit reliably retriggers the build).
//
// Usage: npm run deploy

import { execSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const DIST = 'dist/shriram-invoice-app';
const BASE_HREF = '/shriram-invoices-app/';
const SITE = 'https://nithin2305.github.io/shriram-invoices-app/';
const MAX_ATTEMPTS = 3;
const POLLS_PER_ATTEMPT = 9;   // 9 × 20 s ≈ 3 minutes per attempt
const POLL_SECONDS = 20;

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });
const sleep = (s) => new Promise((res) => setTimeout(res, s * 1000));

console.log('— Building production bundle —');
run(`npx ng build --configuration production --base-href ${BASE_HREF}`);

const bundle = readdirSync(DIST).find((f) => /^main\.[0-9a-f]+\.js$/.test(f));
if (!bundle) {
  console.error(`Could not find main.*.js in ${DIST} — build failed?`);
  process.exit(1);
}
console.log(`Bundle to verify on the live site: ${bundle}`);

const isLive = async () => {
  try {
    // unique query string bypasses the CDN cache
    const r = await fetch(`${SITE}${bundle}?t=${Date.now()}`, { method: 'HEAD', cache: 'no-store' });
    return r.status === 200;
  } catch {
    return false;
  }
};

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  console.log(`\n— Publish attempt ${attempt} of ${MAX_ATTEMPTS} —`);
  run(`npx angular-cli-ghpages --dir=${DIST}`);

  process.stdout.write('Waiting for GitHub Pages to serve the new build ');
  for (let i = 0; i < POLLS_PER_ATTEMPT; i++) {
    await sleep(POLL_SECONDS);
    if (await isLive()) {
      console.log(`\n\n✅ Deployed and verified: ${SITE} now serves ${bundle}`);
      process.exit(0);
    }
    process.stdout.write('.');
  }
  console.log('\nGitHub Pages has not picked this push up — pushing a fresh commit to retrigger.');
}

console.error(`\n❌ Live site still not updated after ${MAX_ATTEMPTS} attempts.`);
console.error('Check github.com/nithin2305/shriram-invoices-app → Settings → Pages');
console.error('(source should be "Deploy from a branch" → gh-pages) and the repo\'s Actions tab for failed "pages build and deployment" runs.');
process.exit(1);
