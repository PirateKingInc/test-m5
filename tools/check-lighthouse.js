// Reads a Lighthouse JSON report and fails unless the site is installable.
// Lighthouse 11 is the last release with the PWA category; installability
// itself comes from Chrome (`installable-manifest`), so that audit is the one
// that must pass - and so must every other automatically scored PWA audit.
//
//   node tools/check-lighthouse.js report.json

import { readFileSync } from 'node:fs';

const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const pwa = report.categories?.pwa;
if (!pwa) {
  console.error('the report has no PWA category - run Lighthouse 11 with --only-categories=pwa');
  process.exit(1);
}

let failed = 0;
for (const ref of pwa.auditRefs) {
  const a = report.audits[ref.id];
  if (a.scoreDisplayMode === 'manual' || a.scoreDisplayMode === 'notApplicable') continue;
  const ok = a.score === 1;
  if (!ok) failed += 1;
  console.log(`${ok ? 'pass' : 'FAIL'}  ${ref.id}${ok ? '' : `: ${a.title}`}`);
  if (!ok && a.details?.items) {
    for (const item of a.details.items) console.log(`      ${JSON.stringify(item)}`);
  }
}

const score = Math.round(pwa.score * 100);
console.log(`Lighthouse ${report.lighthouseVersion} PWA score: ${score}/100 on ${report.finalDisplayedUrl ?? report.finalUrl}`);
if (report.audits['installable-manifest']?.score !== 1) {
  console.error('not installable: installable-manifest failed');
  process.exit(1);
}
if (failed) {
  console.error(`${failed} PWA audit(s) failed`);
  process.exit(1);
}
