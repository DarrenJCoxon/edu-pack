#!/usr/bin/env node
/**
 * Does the installed bundle actually put its skills in front of the model?
 *
 * The patch composing correctly proves only that a YAML entry loaded. The relevant question is whether the skills reach the system prompt, because a skill
 * that is installed but never surfaced is indistinguishable from one that does
 * not exist — and it fails silently, which is worse.
 *
 * The check is deterministic: a fake provider records the request body, and we
 * look for the skill names in the system prompt. No model judgement involved.
 *
 * Usage: node registration.mjs --dsh-home <home>
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const args = { 'dsh-home': path.join(os.homedir(), '.dsh') };
for (let i = 2; i < process.argv.length; i += 1) {
  const flag = process.argv[i];
  if (!flag.startsWith('--')) continue;
  const next = process.argv[i + 1];
  if (next === undefined || next.startsWith('--')) args[flag.slice(2)] = true;
  else { args[flag.slice(2)] = next; i += 1; }
}

const HOME_DIR = path.resolve(args['dsh-home']);
const PORT = Number(args.port ?? 8794);
const EXPECTED = ['spec-to-scheme', 'coverage-matrix', 'resource-pack'];

let captured = '';
const server = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (request.method === 'POST') captured += Buffer.concat(chunks).toString('utf8');

  response.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const frame = (delta, finish = null) => `data: ${JSON.stringify({
    id: 'x', object: 'chat.completion.chunk', created: 0, model: 'probe',
    choices: [{ index: 0, delta, finish_reason: finish }],
  })}\n\n`;
  response.write(frame({ role: 'assistant' }));
  response.write(frame({ content: 'ok' }, 'stop'));
  response.write('data: [DONE]\n\n');
  response.end();
});

await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));

// An overlay, so the test home itself stays exactly as the installer left it.
const overlay = path.join(await mkdtemp(path.join(os.tmpdir(), 'reg-')), 'overlay.yml');
await writeFile(overlay, [
  '- id: agent-default-model',
  '  config:',
  '    provider: probe',
  '    model: probe',
  '- id: llm-pi-ai',
  '  config:',
  '    providers:',
  '      probe:',
  '        displayName: Probe',
  '        api: openai-completions',
  `        baseURL: http://127.0.0.1:${PORT}/v1`,
  '        apiKeyEnv: PROBE_KEY',
  '        models:',
  '          - id: probe',
  '            contextWindow: 32000',
  '',
].join('\n'), 'utf8');

const bin = path.join(process.env.HOME, '.dsh', 'profiles', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');

// The profile name is whatever the installer wrote into; find the single one.
const { readdir } = await import('node:fs/promises');
const profiles = (await readdir(path.join(HOME_DIR, 'profiles'), { withFileTypes: true }))
  .filter((e) => e.isDirectory() && e.name !== 'node_modules')
  .map((e) => e.name);
const profile = args.profile ?? profiles[0];

const child = spawn(process.execPath, [bin, '--profile', profile, '--patch', overlay, 'say hi'], {
  env: { ...process.env, DSH_HOME: HOME_DIR, PROBE_KEY: 'probe' },
  stdio: ['ignore', 'pipe', 'pipe'],
  cwd: HOME_DIR,
});

let stdout = '';
let stderr = '';
child.stdout.on('data', (c) => { stdout += c; });
child.stderr.on('data', (c) => { stderr += c; });
await new Promise((resolve) => child.on('close', resolve));
server.close();

console.log(`profile: ${profile}`);
console.log(`exit: ${child.exitCode}`);
console.log(`captured request bytes: ${captured.length}`);

if (captured.length === 0) {
  console.log('\nRESULT: INCONCLUSIVE — the provider was never called');
  console.log(stderr.split('\n').slice(-6).join('\n'));
  process.exit(1);
}

const found = EXPECTED.filter((name) => captured.includes(name));
const missing = EXPECTED.filter((name) => !captured.includes(name));

for (const name of found) console.log(`  ✓ ${name} appears in the prompt`);
for (const name of missing) console.log(`  ✗ ${name} absent`);

console.log(`\nRESULT: ${missing.length === 0 ? 'PASS — skills are surfaced to the model' : 'FAIL — skills installed but not surfaced'}`);
process.exitCode = missing.length === 0 ? 0 : 1;
