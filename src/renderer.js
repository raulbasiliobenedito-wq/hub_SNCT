const state = { games: [], query: '', installedOnly: false, logs: [], openMenuId: null };

const elements = {
  games: document.querySelector('#games'),
  empty: document.querySelector('#empty'),
  count: document.querySelector('#game-count'),
  search: document.querySelector('#search'),
  allFilter: document.querySelector('#all-filter'),
  installedFilter: document.querySelector('#installed-filter'),
  gitDot: document.querySelector('#git-dot'),
  gitStatus: document.querySelector('#git-status'),
  pythonDot: document.querySelector('#python-dot'),
  pythonStatus: document.querySelector('#python-status'),
  toast: document.querySelector('#toast'),
  logPanel: document.querySelector('#log-panel'),
  logTitle: document.querySelector('#log-title'),
  logOutput: document.querySelector('#log-output'),
  terminalState: document.querySelector('#terminal-state')
};

function openTerminal() {
  document.body.classList.add('terminal-open');
  elements.logPanel.classList.add('open');
  elements.logPanel.setAttribute('aria-hidden', 'false');
}

function closeTerminal() {
  document.body.classList.remove('terminal-open');
  elements.logPanel.classList.remove('open');
  elements.logPanel.setAttribute('aria-hidden', 'true');
}

function updateTerminalState() {
  const active = state.games.some((game) => game.busy || game.running);
  elements.terminalState.classList.toggle('live', active);
  elements.terminalState.querySelector('span').textContent = active ? 'PROCESSO ATIVO' : 'PRONTO';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function buttonFor(game) {
  if (!game.configured) return '<button class="primary" disabled>EM BREVE</button>';
  if (game.busy) {
    const labels = { update: 'ATUALIZANDO', uninstall: 'REMOVENDO' };
    return `<button class="primary" disabled><span class="spinner"></span>${labels[game.busyAction] || 'PREPARANDO'}</button>`;
  }
  if (game.running) return `<button class="primary action" data-action="stop" data-id="${escapeHtml(game.id)}">■ ENCERRAR</button>`;
  if (game.installed) return `<button class="primary action" data-action="play" data-id="${escapeHtml(game.id)}">▶ JOGAR</button>`;
  return `<button class="primary action" data-action="install" data-id="${escapeHtml(game.id)}">↓ INSTALAR</button>`;
}

function menuFor(game) {
  const id = escapeHtml(game.id);
  const isOpen = state.openMenuId === game.id;
  const updateDisabled = game.installed && !game.busy && !game.running ? '' : 'disabled';
  const uninstallDisabled = game.hasLocalFiles && !game.busy ? '' : 'disabled';
  return `
    <div class="card-menu${isOpen ? ' open' : ''}">
      <button class="secondary menu-trigger" type="button" data-menu-id="${id}" aria-haspopup="menu" aria-expanded="${isOpen}" title="Mais opções">···</button>
      <div class="action-menu" role="menu" aria-hidden="${!isOpen}">
        <button class="menu-action action" type="button" role="menuitem" data-action="update" data-id="${id}" ${updateDisabled}>↻ <span>Atualizar</span></button>
        <button class="menu-action danger action" type="button" role="menuitem" data-action="uninstall" data-id="${id}" ${uninstallDisabled}>× <span>Desinstalar</span></button>
        <div class="menu-separator"></div>
        <button class="menu-action action" type="button" role="menuitem" data-action="folder" data-id="${id}">▣ <span>Abrir pasta raiz</span></button>
      </div>
    </div>`;
}

function statusFor(game) {
  if (!game.configured) return ['AGUARDANDO', ''];
  if (game.busy) {
    const labels = { update: 'ATUALIZANDO', uninstall: 'REMOVENDO' };
    return [labels[game.busyAction] || 'INSTALANDO', 'installed'];
  }
  if (game.running) return ['EM EXECUÇÃO', 'running'];
  if (game.installed) return ['INSTALADO', 'installed'];
  return ['DISPONÍVEL', ''];
}

function visibleGames() {
  const query = state.query.trim().toLocaleLowerCase('pt-BR');
  return state.games.filter((game) => {
    if (state.installedOnly && !game.installed) return false;
    return !query || `${game.name} ${game.authors} ${game.description}`.toLocaleLowerCase('pt-BR').includes(query);
  });
}

function render() {
  const games = visibleGames();
  elements.count.textContent = games.length;
  elements.empty.hidden = games.length > 0;
  elements.games.innerHTML = games.map((game) => {
    const [label, className] = statusFor(game);
    return `
      <article class="game-card" style="--accent:${escapeHtml(game.accent || '#78f2bd')}">
        <div class="card-top">
          <div class="game-icon">${escapeHtml(game.icon || game.name.slice(0, 1))}</div>
          <span class="status ${className}">${label}</span>
        </div>
        <h3>${escapeHtml(game.name)}</h3>
        <span class="authors">${escapeHtml(game.authors)}</span>
        <p class="description">${escapeHtml(game.description)}</p>
        <div class="card-actions">
          ${buttonFor(game)}
          ${menuFor(game)}
        </div>
      </article>`;
  }).join('');
  updateTerminalState();
}

let toastTimer;
function showToast(message, kind = 'info') {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.className = `toast show ${kind === 'error' ? 'error' : ''}`;
  toastTimer = setTimeout(() => { elements.toast.className = 'toast'; }, 4200);
}

function errorMessage(error) {
  return error?.message?.replace(/^Error invoking remote method '[^']+': Error:\s*/, '') || 'Ocorreu um erro inesperado.';
}

async function act(action, id) {
  const game = state.games.find((item) => item.id === id);
  try {
    if (action === 'install') {
      showToast(`Preparando ${game.name}…`);
      openTerminal();
      await window.hub.install(id);
    } else if (action === 'update') {
      showToast(`Atualizando ${game.name}…`);
      openTerminal();
      await window.hub.update(id);
    } else if (action === 'uninstall') {
      const confirmed = window.confirm(`Desinstalar ${game.name}?\n\nTodos os arquivos locais desse jogo serão removidos.`);
      if (!confirmed) return;
      showToast(`Desinstalando ${game.name}…`);
      openTerminal();
      await window.hub.uninstall(id);
    } else if (action === 'play') {
      openTerminal();
      await window.hub.play(id);
    } else if (action === 'stop') {
      openTerminal();
      await window.hub.stop(id);
    } else if (action === 'folder') {
      await window.hub.openFolder(id);
    }
    state.games = await window.hub.listGames();
    render();
  } catch (error) {
    const message = errorMessage(error);
    showToast(message, 'error');
    addLog({ name: game?.name || 'Launcher', message, kind: 'error' });
  }
}

function addLog(payload) {
  const cleanMessage = payload.message.trim();
  if (!cleanMessage) return;
  const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  state.logs.push(`[${time}] ${payload.name}: ${cleanMessage}`);
  if (state.logs.length > 250) state.logs.shift();
  elements.logTitle.textContent = payload.kind === 'error' ? 'Atenção necessária' : payload.name;
  elements.logOutput.textContent = state.logs.join('\n');
  elements.logOutput.scrollTop = elements.logOutput.scrollHeight;
  if (payload.kind === 'success') showToast(cleanMessage);
}

elements.games.addEventListener('click', (event) => {
  const trigger = event.target.closest('.menu-trigger');
  if (trigger) {
    state.openMenuId = state.openMenuId === trigger.dataset.menuId ? null : trigger.dataset.menuId;
    render();
    return;
  }

  const button = event.target.closest('.action');
  if (button) {
    state.openMenuId = null;
    render();
    act(button.dataset.action, button.dataset.id);
  }
});

document.addEventListener('click', (event) => {
  if (state.openMenuId && !event.target.closest('.card-menu')) {
    state.openMenuId = null;
    render();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.openMenuId) {
    state.openMenuId = null;
    render();
  }
});

elements.search.addEventListener('input', (event) => { state.query = event.target.value; render(); });
elements.allFilter.addEventListener('click', () => {
  state.installedOnly = false;
  elements.allFilter.classList.add('active');
  elements.installedFilter.classList.remove('active');
  render();
});
elements.installedFilter.addEventListener('click', () => {
  state.installedOnly = true;
  elements.installedFilter.classList.add('active');
  elements.allFilter.classList.remove('active');
  render();
});

document.querySelector('#open-log').addEventListener('click', () => {
  openTerminal();
});
document.querySelector('#close-log').addEventListener('click', () => {
  closeTerminal();
});
document.querySelector('#clear-log').addEventListener('click', () => {
  state.logs = [];
  elements.logTitle.textContent = 'Terminal limpo';
  elements.logOutput.textContent = 'C:\\HUB> Aguardando próximo comando...';
});

window.hub.onProgress(addLog);
window.hub.onCatalogChanged((games) => { state.games = games; render(); });

async function initialize() {
  try {
    const [games, system] = await Promise.all([window.hub.listGames(), window.hub.checkSystem()]);
    state.games = games;
    elements.gitDot.className = system.git ? 'ok' : 'bad';
    elements.gitStatus.textContent = system.git ? 'Git disponível' : 'Git não encontrado';
    elements.pythonDot.className = system.python ? 'ok' : 'bad';
    elements.pythonStatus.textContent = system.python ? `Python ${system.python}` : 'Python compatível ausente';
    render();
  } catch (error) {
    showToast(errorMessage(error), 'error');
  }
}

initialize();
