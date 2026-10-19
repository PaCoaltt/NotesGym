import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const output = process.argv[2];
if (!output) throw new Error('Usage: node scripts/chatgpt-audit.mjs REPORT.json');
const production = process.argv.includes('--prod');
const result = process.platform === 'win32'
  ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'npx --yes pnpm@10.11.0 audit --json' + (production ? ' --prod' : '')], { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 })
  : spawnSync('pnpm', ['audit', '--json', ...(production ? ['--prod'] : [])], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
let data;
try { data = JSON.parse(result.stdout); } catch { throw new Error('Audit unavailable; no result inferred'); }
if (!data.metadata || !data.advisories) throw new Error('Audit registry error; no result inferred');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const report = { checked: new Date().toISOString(), productionOnly: production, vulnerabilities: data.metadata.vulnerabilities,
  findings: Object.values(data.advisories).map(a => ({ package: a.module_name, severity: a.severity, advisory: a.github_advisory_id,
    title: a.title, url: a.url, affected: a.vulnerable_versions, patched: a.patched_versions, recommendation: a.recommendation,
    occurrences: a.findings.map(f => ({ version: f.version, paths: f.paths, environments: [...new Set(f.paths.map(p => pkg.devDependencies?.[p.split('>')[1]] ? 'development' : 'production'))] })) })) };
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.vulnerabilities));
