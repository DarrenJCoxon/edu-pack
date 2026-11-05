/**
 * Check the YAML path quoting.
 *
 * The failure this prevents — a Windows path whose backslashes are read as YAML
 * escape sequences — cannot be reproduced on macOS, so it is asserted here rather
 * than discovered by a teacher.
 *
 * No dependency on a YAML parser: a backslash is the defect, and a Windows path
 * cannot contain a double quote, so the scalar must contain no backslash at all.
 *
 * Usage: node test/paths.mjs
 */

import assert from 'node:assert/strict';

import { yamlPath } from '../bin/lib/yaml.mjs';

const cases = [
  ['C:\\Users\\Ana\\.dsh\\edu-pack\\skills', 'C:/Users/Ana/.dsh/edu-pack/skills', 'windows path'],
  ['C:\\Program Files\\DeepSeek Harness\\x', 'C:/Program Files/DeepSeek Harness/x', 'path with a space'],
  ['/Users/ana/.dsh/edu-pack/skills', '/Users/ana/.dsh/edu-pack/skills', 'posix path'],
];

for (const [input, expected, label] of cases) {
  const quoted = yamlPath(input);
  assert.ok(quoted.startsWith('"') && quoted.endsWith('"'), `${label}: not a double-quoted scalar`);
  assert.ok(!quoted.includes('\\'), `${label}: contains a backslash, which YAML treats as an escape`);
  assert.equal(quoted.slice(1, -1), expected, `${label}: value changed`);
}

assert.throws(() => yamlPath(''), /empty path/u, 'empty input rejected');
console.log(`paths: ${cases.length} cases pass`);
