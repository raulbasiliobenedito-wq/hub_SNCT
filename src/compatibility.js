const fs = require('node:fs');
const path = require('node:path');

function patchesFor(game, platform) {
  return game.compatibilityPatches?.[platform] || [];
}

function patchTarget(directory, patch) {
  const root = path.resolve(directory);
  const target = path.resolve(root, patch.file);
  if (!target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Caminho de ajuste inválido: ${patch.file}`);
  }
  return target;
}

function patchedContent(source, patch) {
  if (typeof patch.from !== 'string' || !patch.from || typeof patch.to !== 'string') {
    throw new Error(`Ajuste inválido: ${patch.file}`);
  }
  const occurrences = source.split(patch.from).length - 1;
  if (occurrences === 1) return source.replace(patch.from, patch.to);
  if (occurrences === 0) return source;
  throw new Error(`O ajuste de compatibilidade não corresponde ao arquivo: ${patch.file}`);
}

function applyCompatibilityPatches(game, directory, platform = process.platform) {
  for (const patch of patchesFor(game, platform)) {
    const target = patchTarget(directory, patch);
    const source = fs.readFileSync(target, 'utf8');
    const adjusted = patchedContent(source, patch);
    if (adjusted !== source) fs.writeFileSync(target, adjusted);
  }
}

async function restoreCompatibilityPatches(game, directory, originalForPath, platform = process.platform) {
  for (const patch of patchesFor(game, platform)) {
    const target = patchTarget(directory, patch);
    const original = await originalForPath(patch.file);
    const adjusted = patchedContent(original, patch);
    if (adjusted !== original && fs.readFileSync(target, 'utf8') === adjusted) {
      fs.writeFileSync(target, original);
    }
  }
}

module.exports = { applyCompatibilityPatches, restoreCompatibilityPatches };
