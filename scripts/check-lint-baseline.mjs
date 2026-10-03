import { ESLint } from 'eslint';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';

// Legacy warnings are tracked per file + rule as a count. The full message
// text is not part of the key: it can embed TypeScript type text whose
// printing order changes between runs (KI-062). The check fails when any
// file + rule count goes up; counts may only go down.
const patterns = process.argv.slice(2).filter((arg) => arg !== '--write-baseline');
const baselinePath = resolve('scripts/lint-baseline.json');
const eslint = new ESLint();
const results = await eslint.lintFiles(patterns);
const findings = {};
let errors = 0;
for (const result of results) {
  errors += result.errorCount;
  for (const item of result.messages) {
    if (item.severity !== 1) continue;
    const key = `${relative(process.cwd(), result.filePath)}|${item.ruleId ?? 'unknown'}`;
    findings[key] = (findings[key] ?? 0) + 1;
  }
}
const total = Object.values(findings).reduce((a, b) => a + b, 0);
if (process.argv.includes('--write-baseline')) {
  if (errors) {
    console.error(`Cannot record baseline with ${errors} lint errors.`);
    process.exit(1);
  }
  const sorted = Object.fromEntries(Object.entries(findings).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(baselinePath, JSON.stringify(sorted, null, 2) + '\n');
  console.log(`Saved ${total} existing warnings.`);
} else {
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  const added = Object.entries(findings).filter(([key, count]) => count > (baseline[key] ?? 0));
  for (const [key, count] of added)
    console.error(`Lint warnings increased: ${key} ${baseline[key] ?? 0} -> ${count}`);
  console.log(`Lint: ${errors} errors, ${total} warnings, ${added.length} file/rule counts increased.`);
  if (errors || added.length) process.exitCode = 1;
}
