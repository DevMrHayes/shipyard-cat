import { TestRunner } from './src/tests/TestRunner';
import { PlaytestHarness } from './src/tests/PlaytestHarness';

console.log('================================================================');
console.log('       SHIPYARD CAT AUTOMATED PLAYTEST & TEST SUITE             ');
console.log('================================================================\n');

const results = TestRunner.runAllTests();
let failed = 0;

console.log('--- TEST EXECUTION SUMMARY ---');
results.forEach(r => {
  if (r.passed) {
    console.log(`[PASS] [${r.category}] ${r.name} (${r.durationMs}ms)`);
  } else {
    failed++;
    console.error(`[FAIL] [${r.category}] ${r.name} - Error: ${r.error}`);
  }
});

console.log('\n--- PLAYTEST SIMULATION DETAILED SESSION LOGS & TELEMETRY ---');
const playtestSessions = PlaytestHarness.runAllSessions();
playtestSessions.forEach(session => {
  console.log(`\n----------------------------------------------------------------`);
  console.log(`🎮 ${session.name} [${session.passed ? 'PASSED' : 'FAILED'}] (${session.durationMs}ms, ${session.ticksSimulated} ticks)`);
  console.log(`----------------------------------------------------------------`);
  console.log('Observations:');
  session.observations.forEach(obs => console.log(`  • ${obs}`));
  console.log('Telemetry Metrics:');
  for (const [k, v] of Object.entries(session.telemetry)) {
    console.log(`  - ${k}: ${v}`);
  }
  if (session.error) {
    console.error(`  ❌ Error: ${session.error}`);
  }
});

console.log('\n================================================================');
console.log(`TOTAL TESTS & PLAYTESTS: ${results.length}`);
console.log(`PASSED: ${results.length - failed}`);
console.log(`FAILED: ${failed}`);
console.log(`PLAYTEST SESSIONS: ${playtestSessions.filter(s => s.passed).length}/${playtestSessions.length} PASSED`);
console.log('================================================================\n');

if (failed > 0 || playtestSessions.some(s => !s.passed)) {
  process.exit(1);
}

