import { ESLint } from 'eslint';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';

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
    const key = `${relative(process.cwd(), result.filePath)}|${item.ruleId ?? 'unknown'}|${item.message}`;
    findings[key] = (findings[key] ?? 0) + 1;
  }
}
if (process.argv.includes('--write-baseline')) {
  if (errors) {
    console.error(`Cannot record baseline with ${errors} lint errors.`);
    process.exit(1);
  }
  writeFileSync(baselinePath, JSON.stringify(findings, null, 2) + '\n');
  console.log(`Saved ${Object.values(findings).reduce((a, b) => a + b, 0)} existing warnings.`);
} else {
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  const added = Object.entries(findings).filter(([key, count]) => count > (baseline[key] ?? 0));
  if (added.length) {
    for (const [key, count] of added) console.error(`New lint warning (${count}): ${key}`);
  }
  console.log(`Lint: ${errors} errors, ${Object.values(findings).reduce((a, b) => a + b, 0)} warnings, ${added.length} new warning kinds.`);
  if (errors || added.length) process.exitCode = 1;
}
