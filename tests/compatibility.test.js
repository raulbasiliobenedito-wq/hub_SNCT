const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { applyCompatibilityPatches, restoreCompatibilityPatches } = require('../src/compatibility');

test('corrige a anotação do Cosmonauta e a restaura antes de atualizar', async () => {
  const game = require('../games.json').find(({ id }) => id === 'proyekt-kosmonavta');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-compatibility-'));
  const target = path.join(directory, 'src', 'collision', 'collidable.py');
  const original = 'class Collidable:\n    def collide_with(self, collider: Collidable) -> bool:\n        return True\n';
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, original);
    applyCompatibilityPatches(game, directory, 'win32');
    assert.match(fs.readFileSync(target, 'utf8'), /collider: 'Collidable'/);
    await restoreCompatibilityPatches(game, directory, async () => original, 'win32');
    assert.equal(fs.readFileSync(target, 'utf8'), original);
    applyCompatibilityPatches(game, directory, 'win32');
    assert.match(fs.readFileSync(target, 'utf8'), /collider: 'Collidable'/);

    fs.appendFileSync(target, '# alteração local\n');
    await restoreCompatibilityPatches(game, directory, async () => original, 'win32');
    assert.match(fs.readFileSync(target, 'utf8'), /# alteração local/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
