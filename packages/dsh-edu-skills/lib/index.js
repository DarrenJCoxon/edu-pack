/**
 * Registers edu-pack's skills with the harness.
 *
 * Why a plugin rather than a skill directory. The desktop profile disables the
 * `skill-filesystem` provider outright, because the shipped app supplies skills
 * from plugins instead. So `customSkillDirs` is accepted, written to the config,
 * and never read — it fails silently, which is the worst way to fail. This
 * follows the same pattern the Office skills use: register a provider on
 * `ctx.skills` and hand it summaries plus content.
 *
 * Skills are discovered from a directory at runtime, so adding a skill is a
 * matter of dropping a folder in — no code change.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BUNDLED_SKILL_RANK } from '@deepseek-ai/dsh-skill';
import { parse } from 'yaml';

export const name = 'edu-skills';
export const inject = ['skills'];

/** Split YAML frontmatter from the body of a SKILL.md. */
function parseSkill(raw, path) {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw);
  if (frontmatter?.[1] === undefined) throw new Error(`edu-skills: ${path} has no YAML frontmatter`);
  const metadata = parse(frontmatter[1]);
  const description = typeof metadata === 'object' && metadata !== null ? metadata.description : undefined;
  if (typeof description !== 'string' || description.length === 0) {
    throw new Error(`edu-skills: ${path} has no description`);
  }
  return { description, content: raw.slice(frontmatter[0].length).trim() };
}

/** Every skill directory under `assetRoot` that contains a SKILL.md. */
function discover(assetRoot) {
  return readdirSync(assetRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(assetRoot, entry.name))
    .filter((directory) => {
      try {
        return statSync(join(directory, 'SKILL.md')).isFile();
      } catch {
        return false;
      }
    })
    .sort();
}

/**
 * @param {{ skills: { registerProvider: Function } }} ctx
 * @param {{ assetRoot?: string }} [config]
 */
export function apply(ctx, config = {}) {
  const assetRoot = config.assetRoot ?? fileURLToPath(new URL('../../skills/', import.meta.url));
  const directories = discover(assetRoot);

  const candidates = directories.map((directory) => {
    const path = join(directory, 'SKILL.md');
    const { description } = parseSkill(readFileSync(path, 'utf8'), path);
    return {
      name: directory.split(sep).pop(),
      description,
      invocation: { modelInvocable: true, userInvocable: true },
      provider: 'edu-pack',
      source: 'bundled',
      rank: BUNDLED_SKILL_RANK,
      resourceBase: { kind: 'directory', path: directory.split(sep).join('/') },
      locator: path,
    };
  });

  const provider = {
    name: 'edu-pack',
    list: () => Promise.resolve(candidates),
    async get(candidate, options) {
      const { rank: _rank, locator, ...summary } = candidate;
      const content = parseSkill(
        await readFile(locator, { encoding: 'utf8', signal: options.signal }),
        locator,
      ).content;
      return { ...summary, content };
    },
  };

  ctx.skills.registerProvider(() => provider);
  return provider;
}
