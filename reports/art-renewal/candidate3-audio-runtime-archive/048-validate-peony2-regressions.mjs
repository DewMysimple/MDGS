/** Direct successors of the historical settings/subpath acceptance.
 * node scripts/validate-peony2-regressions.mjs --settings|--subpath
 * Add --preflight for bounded chapter-1 checks; --build-dir selects the actual build.
 * --check-adapter is a compatibility syntax/plan flag, with no generated source.
 */
import assert from 'node:assert/strict';
const modes = ['settings', 'subpath'].filter(name => process.argv.includes('--' + name));
assert.equal(modes.length, 1, 'Select exactly one of --settings or --subpath.');
assert.notEqual(process.env.MDGS_LEGACY_RECONSTRUCTION, '1', 'Use validate-subpath.mjs explicitly for the historical reconstruction fixture.');
await import('./validate-peony2-runtime.mjs');
