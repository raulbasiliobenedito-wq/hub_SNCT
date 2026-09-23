const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { installPlan } = require('./dependencies');
const { applyCompatibilityPatches, restoreCompatibilityPatches } = require('./compatibility');

let mainWindow;
const runningGames = new Map();
const busyGames = new Map();

function catalogPath() {
  return path.join(app.getAppPath(), 'games.json');
}

function bundledPythonPath() {
  const root = app.isPackaged ? process.resourcesPath : app.getAppPath();
  return path.join(root, 'runtime', 'python312', 'python.exe');
}

function gamesRoot() {
  return path.join(app.getPath('userData'), 'games');
}

function readCatalog() {
  return JSON.parse(fs.readFileSync(catalogPath(), 'utf8'));
}

function getGame(id) {
  const game = readCatalog().find((item) => item.id === id);
  if (!game) throw new Error('Projeto não encontrado no catálogo.');
  return game;
}

function gameDirectory(game) {
  return path.join(gamesRoot(), game.id);
}

function venvPython(game) {
  const directory = path.join(gameDirectory(game), '.hub-venv');
  const candidates = process.platform === 'win32'
    ? [
      path.join(directory, 'Scripts', 'python.exe'),
      path.join(directory, 'bin', 'python.exe'),
      path.join(directory, 'bin', 'python')
    ]
    : [path.join(directory, 'bin', 'python3'), path.join(directory, 'bin', 'python')];
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function installationMarker(game) {
  return path.join(gameDirectory(game), '.hub-installed');
}

function statusFor(game) {
  const directory = gameDirectory(game);
  const installed = Boolean(
    game.repository &&
    fs.existsSync(path.join(directory, game.entry)) &&
    fs.existsSync(venvPython(game)) &&
    fs.existsSync(installationMarker(game))
  );

  return {
    ...game,
    installed,
    hasLocalFiles: fs.existsSync(directory),
    busy: busyGames.has(game.id),
    busyAction: busyGames.get(game.id) || null,
    running: runningGames.has(game.id),
    configured: Boolean(game.repository)
  };
}

function emit(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function progress(game, message, kind = 'info') {
  if (!message) return;
  emit('game:progress', { id: game.id, name: game.name, message, kind });
}

function runCommand(command, args, options = {}, onOutput = () => { }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      windowsHide: true,
      shell: false,
      env: { ...process.env, PYTHONUTF8: '1', PYTHONUNBUFFERED: '1', PIP_DISABLE_PIP_VERSION_CHECK: '1' }
    });

    let output = '';
    const collect = (data) => {
      const text = data.toString();
      output += text;
      onOutput(text);
    };

    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(output.trim() || `O comando terminou com o código ${code}.`));
    });
  });
}

async function inspectPython(command, prefixArgs = []) {
  try {
    const output = await runCommand(command, [...prefixArgs, '--version']);
    const match = output.match(/Python\s+(\d+)\.(\d+)/i);
    if (!match) return null;
    return {
      command,
      prefixArgs,
      version: `${match[1]}.${match[2]}`,
      major: Number(match[1]),
      minor: Number(match[2])
    };
  } catch {
    return null;
  }
}

async function findPython() {
  const bundledPython = bundledPythonPath();
  const candidates = process.platform === 'win32'
    ? [
      [bundledPython, []],
      ['py', ['-3.13']],
      ['py', ['-3.12']],
      ['py', ['-3.11']],
      ['py', ['-3.10']],
      [path.join(process.env.SystemDrive || 'C:', 'msys64', 'ucrt64', 'bin', 'python.exe'), []],
      ['python', []]
    ]
    : [['python3', []], ['python', []]];

  const found = [];
  for (const [command, prefixArgs] of candidates) {
    const result = await inspectPython(command, prefixArgs);
    if (result && !found.some((item) => item.command === result.command && item.version === result.version)) {
      found.push(result);
    }
  }

  const compatible = found.find((item) => item.major === 3 && item.minor >= 10 && item.minor <= 13);
  const fallback = found.find((item) => item.major === 3 && item.minor >= 10);
  return compatible || fallback || null;
}

async function installGame(game) {
  if (!game.repository) throw new Error('Este projeto ainda não possui um repositório configurado.');
  if (!/^https:\/\//i.test(game.repository)) throw new Error('Use uma URL HTTPS para o repositório.');

  const directory = gameDirectory(game);
  await fs.promises.mkdir(gamesRoot(), { recursive: true });
  progress(game, 'Verificando Git e Python…');

  await runCommand('git', ['--version']);
  const python = await findPython();
  if (!python) throw new Error('Python 3.10, 3.11, 3.12 ou 3.13 não foi encontrado neste computador.');
  progress(game, `Python ${python.version} encontrado.`);

  if (!fs.existsSync(path.join(directory, '.git'))) {
    if (fs.existsSync(directory)) {
      const entries = await fs.promises.readdir(directory);
      if (entries.length) throw new Error('A pasta do jogo já existe, mas não é um repositório Git válido.');
    }
    progress(game, 'Clonando o repositório…');
    progress(game, `> git clone --depth 1 ${game.repository}`);
    await runCommand('git', ['clone', '--depth', '1', game.repository, directory], {}, (text) => progress(game, text.trim()));
  } else {
    progress(game, 'Atualizando o repositório…');
    progress(game, '> git pull --ff-only');
    await restoreCompatibilityPatches(game, directory, (file) =>
      runCommand('git', ['show', `HEAD:${file.replace(/\\/g, '/')}`], { cwd: directory })
    );
    try {
      await runCommand('git', ['pull', '--ff-only'], { cwd: directory }, (text) => progress(game, text.trim()));
    } catch (error) {
      applyCompatibilityPatches(game, directory);
      throw error;
    }
  }

  const entry = path.join(directory, game.entry);
  if (!fs.existsSync(entry)) throw new Error(`Arquivo principal não encontrado: ${game.entry}`);

  applyCompatibilityPatches(game, directory);

  const pythonInVenv = venvPython(game);
  if (!fs.existsSync(pythonInVenv)) {
    progress(game, 'Criando ambiente virtual isolado…');
    const bundledPython = bundledPythonPath();
    const module = path.resolve(python.command) === path.resolve(bundledPython) ? 'virtualenv' : 'venv';
    progress(game, `> python -m ${module} .hub-venv`);
    await runCommand(python.command, [...python.prefixArgs, '-m', module, path.join(directory, '.hub-venv')], { cwd: directory }, (text) => progress(game, text.trim()));
  }

  const plan = installPlan(game, process.platform, directory);
  if (plan) {
    progress(game, 'Instalando as dependências… Isso pode levar alguns minutos.');
    progress(game, `> ${path.relative(directory, pythonInVenv)} ${plan.display}`);
    await runCommand(
      pythonInVenv,
      plan.args,
      { cwd: directory },
      (text) => progress(game, text.trim())
    );
  }

  await fs.promises.writeFile(
    installationMarker(game),
    JSON.stringify({ installedAt: new Date().toISOString(), repository: game.repository })
  );
  progress(game, 'Instalação concluída. O jogo está pronto!', 'success');
  return statusFor(game);
}

async function updateGame(game) {
  if (!statusFor(game).installed) throw new Error('Instale o jogo antes de tentar atualizá-lo.');
  if (runningGames.has(game.id)) throw new Error('Encerre o jogo antes de atualizá-lo.');
  progress(game, 'Procurando atualizações…');
  return installGame(game);
}

async function stopGameAndWait(game) {
  const child = runningGames.get(game.id);
  if (!child) return;

  progress(game, 'Encerrando o jogo antes de desinstalar…');
  await new Promise((resolve, reject) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }

    const timeout = setTimeout(() => {
      reject(new Error('Não foi possível encerrar o jogo. Feche-o e tente desinstalar novamente.'));
    }, 5000);
    const finish = () => {
      clearTimeout(timeout);
      resolve();
    };

    child.once('close', finish);
    child.once('error', finish);
    if (!child.kill()) {
      clearTimeout(timeout);
      reject(new Error('Não foi possível encerrar o jogo. Feche-o e tente desinstalar novamente.'));
    }
  });
}

async function uninstallGame(game) {
  const root = path.resolve(gamesRoot());
  const directory = path.resolve(gameDirectory(game));
  if (!directory.startsWith(`${root}${path.sep}`)) throw new Error('A pasta deste jogo é inválida.');
  if (!fs.existsSync(directory)) throw new Error('Este jogo não está instalado.');

  await stopGameAndWait(game);
  runningGames.delete(game.id);
  progress(game, 'Removendo os arquivos do jogo…');
  await fs.promises.rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  progress(game, 'Jogo desinstalado com sucesso.', 'success');
  return statusFor(game);
}

async function withGameLock(id, task, action = 'install') {
  const game = getGame(id);
  if (busyGames.has(id)) throw new Error('Este projeto já está sendo preparado.');
  busyGames.set(id, action);
  emit('catalog:changed', readCatalog().map(statusFor));
  try {
    return await task(game);
  } finally {
    busyGames.delete(id);
    emit('catalog:changed', readCatalog().map(statusFor));
  }
}

function startGame(game) {
  if (runningGames.has(game.id)) return statusFor(game);
  const python = venvPython(game);
  const directory = gameDirectory(game);
  const entry = path.join(directory, game.entry);

  if (!fs.existsSync(python) || !fs.existsSync(entry)) throw new Error('O jogo ainda não foi instalado completamente.');

  const child = spawn(python, ['-X', 'utf8', entry], {
    cwd: game.workdir ? path.join(directory, game.workdir) : directory,
    // Ocultar o processo também pode ocultar a janela SDL/Pygame no Windows.
    windowsHide: false,
    shell: false,
    env: { ...process.env, PYTHONUTF8: '1', PYTHONUNBUFFERED: '1' }
  });

  runningGames.set(game.id, child);
  progress(game, `> ${path.relative(directory, python)} -X utf8 ${game.entry}`);
  progress(game, 'Jogo iniciado.', 'success');
  emit('catalog:changed', readCatalog().map(statusFor));

  const relay = (data) => progress(game, data.toString().trim());
  child.stdout.on('data', relay);
  child.stderr.on('data', relay);
  child.on('error', (error) => progress(game, error.message, 'error'));
  child.on('close', (code) => {
    runningGames.delete(game.id);
    progress(game, code === 0 ? 'Jogo encerrado.' : `Jogo encerrado com o código ${code}.`, code === 0 ? 'info' : 'error');
    emit('catalog:changed', readCatalog().map(statusFor));
  });

  return statusFor(game);
}

function stopGame(game) {
  const child = runningGames.get(game.id);
  if (child) {
    child.kill();
    runningGames.delete(game.id);
    progress(game, 'Solicitação para encerrar enviada.');
  }
  return statusFor(game);
}

function registerHandlers() {
  ipcMain.handle('catalog:list', () => readCatalog().map(statusFor));
  ipcMain.handle('system:check', async () => {
    let git = false;
    try {
      await runCommand('git', ['--version']);
      git = true;
    } catch { }
    const python = await findPython();
    return { git, python: python ? python.version : null, installDirectory: gamesRoot() };
  });
  ipcMain.handle('game:install', (_event, id) => withGameLock(id, installGame));
  ipcMain.handle('game:update', (_event, id) => withGameLock(id, updateGame, 'update'));
  ipcMain.handle('game:uninstall', (_event, id) => withGameLock(id, uninstallGame, 'uninstall'));
  ipcMain.handle('game:play', (_event, id) => startGame(getGame(id)));
  ipcMain.handle('game:stop', (_event, id) => stopGame(getGame(id)));
  ipcMain.handle('game:folder', async (_event, id) => {
    const game = getGame(id);
    await fs.promises.mkdir(gameDirectory(game), { recursive: true });
    return shell.openPath(gameDirectory(game));
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: '#08110f',
    title: 'Arcade da Turma',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  if (process.argv.includes('--screenshot')) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        if (process.argv.includes('--terminal-preview')) {
          await mainWindow.webContents.executeJavaScript("document.body.classList.add('terminal-open'); document.querySelector('#log-panel').classList.add('open'); void 0");
          await new Promise((resolve) => setTimeout(resolve, 400));
        }
        mainWindow.show();
        const image = await mainWindow.webContents.capturePage();
        await fs.promises.writeFile(path.join(app.getAppPath(), 'preview.png'), image.toPNG());
        app.quit();
      }, 1200);
    });
  }
}

app.whenReady().then(() => {
  registerHandlers();
  createWindow();
  const installArgument = process.argv.find((argument) => argument.startsWith('--install='));
  if (installArgument) {
    const gameId = installArgument.slice('--install='.length);
    mainWindow.webContents.once('did-finish-load', async () => {
      try {
        await withGameLock(gameId, installGame);
        console.log(`Instalação de ${gameId} validada com sucesso.`);
        app.exit(0);
      } catch (error) {
        console.error(error);
        app.exit(1);
      }
    });
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  for (const child of runningGames.values()) child.kill();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
