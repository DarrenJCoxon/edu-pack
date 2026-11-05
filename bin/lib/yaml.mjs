/**
 * YAML path quoting.
 *
 * A Windows path contains backslashes, and a YAML double-quoted scalar treats
 * them as escape sequences: "C:\Users\Ana" becomes a mangled string, or an error.
 * The configuration would then point at a directory that does not exist, and the
 * skills would not appear, with no diagnostic.
 *
 * Converting to forward slashes avoids the escape entirely. Windows accepts them
 * in every path the installer writes, and YAML reads the scalar unchanged.
 */

/**
 * @param {string} value an absolute path, from either platform
 * @returns {string} a YAML double-quoted scalar safe to write into a patch file
 */
export function yamlPath(value) {
  const text = String(value);
  if (text.length === 0) throw new Error('yamlPath: empty path');
  const normalised = text.replace(/\\/gu, '/');
  const escaped = normalised.replace(/"/gu, '\\"');
  return `"${escaped}"`;
}
