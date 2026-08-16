import { TestRunner } from './src/tests/TestRunner';

const results = TestRunner.runAllTests();
console.log('--- SHIPYARD CAT AUTOMATED TEST DIAGNOSTICS ---');
let failed = 0;
results.forEach(r => {
  if (r.passed) {
    console.log(`[PASS] [${r.category}] ${r.name} (${r.durationMs}ms)`);
  } else {
    failed++;
    console.error(`[FAIL] [${r.category}] ${r.name} - Error: ${r.error}`);
  }
});
console.log(`\nTotal: ${results.length}, Passed: ${results.length - failed}, Failed: ${failed}`);
if (failed > 0) process.exit(1);
