import { readFile, readdir, access } from 'node:fs/promises';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
async function files(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'review-session', '.local', 'output'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      // A source/reference checkout may sit beside the target while a port is
      // reviewed. It is a separate repository and must never inflate or alter
      // this repository's artifact evidence.
      try { await access(join(path, '.git')); continue; } catch {}
      result.push(...await files(path));
    } else result.push(path);
  }
  return result;
}
const errors = [], inventory = await files(root);
const manifest = JSON.parse(await readFile(join(root, 'forge/sdd-manifest.json'), 'utf8'));
const packageMetadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
for (const field of ['name', 'version', 'main']) {
  if (typeof packageMetadata[field] !== 'string' || !packageMetadata[field].trim()) errors.push(`package.json: deployment requires a non-empty ${field} field`);
}
if (typeof packageMetadata.version === 'string' && !semver.test(packageMetadata.version)) errors.push('package.json: version must be a semver string');
if (typeof packageMetadata.main !== 'string' || !packageMetadata.main.trim()) errors.push('package.json: deployment requires a non-empty main entry');
else {
  try { await access(join(root, packageMetadata.main)); }
  catch { errors.push(`package.json: main entry does not exist: ${packageMetadata.main}`); }
}
for (const script of ['build', 'start']) if (typeof packageMetadata.scripts?.[script] !== 'string' || !packageMetadata.scripts[script].trim()) errors.push(`package.json: deployment requires a non-empty ${script} script`);
const configSource = await readFile(join(root, 'src/server/config.mjs'), 'utf8');
if (!/loadConfig\(environment = process\.env\)/.test(configSource) || !/positiveInteger\(environment\.PORT,\s*\d+,\s*"PORT"\)/.test(configSource)) errors.push('src/server/config.mjs: deployment requires PORT to default from process.env.PORT');
const serverSource = await readFile(join(root, 'src/server/index.mjs'), 'utf8');
if (!serverSource.includes('server.listen(config.port, config.mode === "production" ? "0.0.0.0" : "127.0.0.1"')) errors.push('src/server/index.mjs: deployment requires the HTTP server to bind 0.0.0.0');
for (const deploymentFile of ['Dockerfile', '.dockerignore']) {
  try { await access(join(root, deploymentFile)); }
  catch { errors.push(`Missing container deployment file: ${deploymentFile}`); }
}
const runtimeDependencies = packageMetadata.dependencies || {};
for (const path of inventory.filter(path => relative(root, path).startsWith('src/server/') && /\.(?:mjs|js)$/.test(path))) {
  const source = await readFile(path, 'utf8');
  for (const match of source.matchAll(/\bfrom\s+["']([^"']+)["']|\bimport\s+["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']/g)) {
    const specifier = match[1] ?? match[2] ?? match[3];
    if (specifier.startsWith('.') || specifier.startsWith('node:')) continue;
    const dependency = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
    if (!(dependency in runtimeDependencies)) errors.push(`${relative(root, path)}: runtime package ${dependency} must be in dependencies`);
  }
}
const tracked = spawnSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' });
if (tracked.status === 0 && tracked.stdout.split(/\r?\n/).some(path => /(^|\/)node_modules\//.test(path))) errors.push('Git source must not contain node_modules');
const ignoredNodeModules = spawnSync('git', ['check-ignore', '-q', 'node_modules'], { cwd: root });
if (ignoredNodeModules.status !== 0) errors.push('.gitignore must exclude node_modules');
const active = manifest.prototype_candidates;
const archived = (manifest.prototype_candidate_history || []).map(entry => entry.candidate);
const indexedEntries = new Set([...active, ...archived].map(entry => `${entry.prototype_source_root}/index.html`));
if (active.length !== 3 || new Set(active.map(entry => entry.candidate_id)).size !== 3) {
  errors.push('Expected exactly three distinct active design candidates in the manifest');
}
for (const name of indexedEntries) {
  try { await access(join(root, name)); }
  catch { errors.push(`Missing indexed candidate entry: ${name}`); }
}
let scripts = 0, documents = 0, candidates = 0;
for (const path of inventory) {
  if (!/\.(md|html|css|js|mjs|json)$/.test(path)) continue;
  const name = relative(root, path), source = await readFile(path, 'utf8');
  if (/\/Users\/[A-Za-z]/.test(source)) errors.push(`${name}: local user path in publishable file`);
  if (path.endsWith('.md')) {
    documents++;
    for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = match[1];
      if (/^(https?:|#|mailto:)/.test(target)) continue;
      try { await access(resolve(dirname(path), decodeURIComponent(target.split('#')[0]))); }
      catch { errors.push(`${name}: missing link ${target}`); }
    }
  }
  if (/\.(m?js)$/.test(path)) {
    scripts++;
    const check = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
    if (check.status !== 0) errors.push(`${name}: ${check.stderr}`);
  }
  if (path.endsWith('.html')) {
    const ids = [...source.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    if (new Set(ids).size !== ids.length) errors.push(`${name}: duplicate static HTML IDs`);
    for (const match of source.matchAll(/(?:aria-controls|aria-labelledby)="([^"]+)"/g)) {
      for (const id of match[1].split(' ')) if (!ids.includes(id)) errors.push(`${name}: missing static ARIA reference ${id}`);
    }
  }
  if (/^forge\/design\/candidates\//.test(name)) {
    if (path.endsWith('/index.html')) {
      candidates++;
      if (!indexedEntries.has(name)) errors.push(`${name}: candidate is absent from active and historical indexes`);
    }
    if (/\.(js|html)$/.test(path) && /\b(fetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|getUserMedia\s*\(|new\s+MediaRecorder|new\s+SpeechRecognition)/.test(source)) errors.push(`${name}: live-service, recording or persistence API in design candidate`);
    if (path.endsWith('.html') && /\bon[a-z]+\s*=|\bstyle\s*=|<script\b(?![^>]*\bsrc=)/i.test(source)) errors.push(`${name}: inline executable/style content conflicts with preview CSP`);
  }
}
if (candidates !== indexedEntries.size) errors.push(`Indexed ${indexedEntries.size} candidate entry pages; found ${candidates}`);
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`Passed: ${documents} Markdown files, ${scripts} JavaScript syntax checks, ${active.length} active candidates and ${candidates} total versioned entry pages; links, public paths and static HTML references. Runtime flows require browser review.`);
