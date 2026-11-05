#!/usr/bin/env node
/**
 * Install the edu-pack skills into a DeepSeek Harness home.
 *
 * The installer performs three steps:
 *   1. the pack is copied to `<home>/edu-pack`
 *   2. the skill-provider plugin is copied into the profile's node_modules
 *   3. a home-patch entry inserts that plugin
 *
 * Why a plugin, not a skill directory. The first version of this installer wrote
 * `customSkillDirs` onto the `skill-filesystem` entry. It was accepted, written to
 * config, and never read: the desktop profile sets `disabled: true` on that
 * provider, because the shipped app supplies skills from plugins instead. Verified
 * by composing the profile and reading the result. The symptom is a skill that
 * installs cleanly and never appears.
 *
 * Usage:
 *   node install.mjs [--dsh-home ~/.dsh] [--dry-run]
 */

import { cp, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const args = {};
for (let i = 2; i < process.argv.length; i += 1) {
  const flag = process.argv[i];
  if (!flag.startsWith('--')) continue;
  const next = process.argv[i + 1];
  if (next === undefined || next.startsWith('--')) args[flag.slice(2)] = true;
  else { args[flag.slice(2)] = next; i += 1; }
}

const home = path.resolve(args['dsh-home'] ?? path.join(os.homedir(), '.dsh'));
const target = path.resolve(args.target ?? path.join(home, 'edu-pack'));
const dryRun = args['dry-run'] === true;

const exists = async (p) => { try { await stat(p); return true; } catch { return false; } };

if (!(await exists(home))) {
  console.error(`No harness home at ${home}. Open DeepSeek Harness once first.`);
  process.exit(1);
}

const profilesDir = path.join(home, 'profiles');
const profiles = (await readdir(profilesDir, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name !== 'node_modules')
  .map((entry) => entry.name);
const profile = profiles.includes('desktop') ? 'desktop' : profiles[0];

if (profile === undefined) {
  console.error(`No profile found under ${profilesDir}. Open DeepSeek Harness once first.`);
  process.exit(1);
}

const profileDir = path.join(profilesDir, profile);
const skillsDir = path.join(target, 'skills');

console.log(`pack:    ${HERE}`);
console.log(`target:  ${target}`);
console.log(`profile: ${profile}`);

if (dryRun) {
  console.log('\ndry run: nothing written');
  process.exit(0);
}

// ---- 1. Copy the pack ----------------------------------------------------
await mkdir(target, { recursive: true });
for (const entry of ['skills', 'packages', 'bin', 'vendor']) {
  await cp(path.join(HERE, entry), path.join(target, entry), {
    recursive: true,
    filter: (source) => !source.includes('node_modules'),
  });
}
await cp(path.join(HERE, 'README.md'), path.join(target, 'README.md'));
console.log('copied skills and packages');

// ---- 2. Install the plugin beside the other profile packages -------------
const scope = path.join(profileDir, 'node_modules', '@edu-pack');
await mkdir(scope, { recursive: true });
await cp(path.join(target, 'packages', 'dsh-edu-skills'), path.join(scope, 'dsh-edu-skills'), { recursive: true });
console.log('installed plugin @edu-pack/dsh-edu-skills');

// ---- 3. Patch ------------------------------------------------------------
const patchFile = path.join(home, 'cordis.patch.yml');
const existing = await readFile(patchFile, 'utf8').catch(() => '');

/** Drop a top-level `- id: <id>` entry, whatever its body. */
function stripEntry(text, id) {
  const lines = text.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/^\s*-\s+id:\s+(\S+)\s*$/);
    if (match && match[1] === id) {
      i += 1;
      while (i < lines.length && !/^- /.test(lines[i])) i += 1;
      i -= 1;
      continue;
    }
    out.push(lines[i]);
  }
  return out.join('\n');
}

let patch = existing;
// Remove the earlier, non-functional skill-filesystem override if we wrote one.
if (patch.includes(skillsDir)) patch = stripEntry(patch, 'skill-filesystem');
patch = patch.split('\n').filter((line) => line.trim() !== '[]').join('\n').replace(/\s+$/u, '');

const entry = [
  '- insert:',
  '    - id: edu-skills',
  '      name: "@edu-pack/dsh-edu-skills"',
  '      config:',
  `        assetRoot: "${skillsDir}"`,
  '',
].join('\n');

if (patch.includes('edu-skills')) {
  console.log('plugin already registered in the home patch');
} else {
  const next = patch.length === 0 ? entry : `${patch}\n${entry}`;
  await writeFile(patchFile, next, 'utf8');
  console.log(`registered plugin with assetRoot ${skillsDir}`);
}

// ---- Checks --------------------------------------------------------------
// Nothing to install: PDF reading uses vendored pdf.js and scripts run on the
// harness's own runtime. Report this explicitly.
console.log('dependencies: none required');

console.log('\nRestart DeepSeek Harness, then start a new conversation and type "/"');
console.log('to see: spec-to-scheme, coverage-matrix, resource-pack.');
