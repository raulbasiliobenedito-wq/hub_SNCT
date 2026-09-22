const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { installPlan } = require('../src/dependencies');

test('Cosmonauta exige wheel no Windows e usa instalação normal no Linux', () => {
  const game = require('../games.json').find(({ id }) => id === 'proyekt-kosmonavta');
  const directory = path.join(os.tmpdir(), 'hub-dependencies-test');
  assert.deepEqual(installPlan(game, 'win32', directory).args, [
    '-m', 'pip', 'install', '--only-binary=:all:', 'pygame-ce'
  ]);
  assert.deepEqual(installPlan(game, 'linux', directory).args, [
    '-m', 'pip', 'install', 'pygame-ce'
  ]);
});

test('usa o arquivo ou pacote indicado para cada plataforma', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-dependencies-'));
  try {
    fs.writeFileSync(path.join(directory, 'requirements-win.txt'), 'pygame-ce\n');
    const game = {
      requirements: 'pygame-ce',
      requirementsByPlatform: { win32: 'requirements-win.txt' }
    };
    assert.deepEqual(installPlan(game, 'win32', directory).args, [
      '-m', 'pip', 'install', '-r', path.join(directory, 'requirements-win.txt')
    ]);
    assert.deepEqual(installPlan(game, 'linux', directory).args, [
      '-m', 'pip', 'install', 'pygame-ce'
    ]);
    assert.throws(() => installPlan({ requirements: 'missing.txt' }, 'win32', directory),
      /Arquivo de dependências não encontrado/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
