const fs = require('node:fs');
const path = require('node:path');

function installPlan(game, platform, directory) {
  const requirements = String(
    game.requirementsByPlatform?.[platform] ?? game.requirements ?? 'requirements.txt'
  ).trim();
  if (!requirements) throw new Error(`Dependências não configuradas para ${platform}.`);
  const options = game.pipOptionsByPlatform?.[platform] ?? [];
  if (!Array.isArray(options) || !options.every((option) => typeof option === 'string')) {
    throw new Error(`Opções do pip inválidas para ${platform}.`);
  }

  const requirementsPath = path.resolve(directory, requirements);
  let sourceArgs;
  if (fs.existsSync(requirementsPath) && fs.statSync(requirementsPath).isFile()) {
    sourceArgs = ['-r', requirementsPath];
  } else if (requirements === 'requirements.txt') {
    return null;
  } else if (requirements.endsWith('.txt') || requirements.includes('/') || requirements.includes('\\')) {
    throw new Error(`Arquivo de dependências não encontrado: ${requirements}`);
  } else {
    sourceArgs = requirements.split(/\s+/);
  }

  return {
    args: ['-m', 'pip', 'install', ...options, ...sourceArgs],
    display: ['-m', 'pip', 'install', ...options, ...sourceArgs.map((arg) =>
      arg === requirementsPath ? requirements : arg
    )].join(' ')
  };
}

module.exports = { installPlan };
