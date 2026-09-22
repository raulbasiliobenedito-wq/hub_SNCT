# Arcade da Turma — Hub Launcher

Aplicativo desktop em Electron para reunir, instalar e executar os 11 jogos Pygame da turma.

## Como abrir

No Windows, clique duas vezes em `INICIAR_HUB.bat`.

Como alternativa, use o PowerShell dentro desta pasta:

```powershell
npm install
npm start
```

O launcher usa o Python 3.12 portátil incluído em `runtime`, verifica o Git, clona cada repositório e cria um ambiente virtual separado. Em seguida, instala o `requirements.txt` e libera o botão **Jogar**.

## Como cadastrar os 11 jogos

Edite `games.json`. Cada objeto representa um jogo:

```json
{
  "id": "nome-curto-sem-espacos",
  "name": "Nome do jogo",
  "authors": "Nome da equipe",
  "description": "Descrição curta do jogo.",
  "repository": "https://github.com/usuario/repositorio.git",
  "entry": "main.py",
  "requirements": "requirements.txt",
  "accent": "#78f2bd",
  "icon": "NJ"
}
```

- `id`: deve ser único e não deve mudar depois que o jogo for instalado.
- `repository`: endereço HTTPS do GitHub. Deixe vazio enquanto o projeto não estiver pronto.
- `entry`: caminho do arquivo inicial dentro do repositório.
- `requirements`: caminho do arquivo de dependências dentro do repositório ou nome dos pacotes separados por espaço.
- `requirementsByPlatform`: dependências específicas para `win32`, `linux` ou `darwin`; substitui `requirements` na plataforma indicada.
- `pipOptionsByPlatform`: opções extras do `pip` por plataforma. O Cosmonauta usa `--only-binary=:all:` no Windows para baixar um wheel compatível do `pygame-ce` sem tentar compilá-lo.
- `workdir`: campo opcional caso o jogo precise iniciar em uma subpasta específica.

## Padrão recomendado para cada projeto

```text
repositorio/
├── main.py
├── requirements.txt
└── assets/
```

O `requirements.txt` normalmente terá pelo menos:

```text
pygame==2.6.1
```

## Onde ficam os jogos

Durante o desenvolvimento, o Electron armazena os repositórios em `%APPDATA%/hub-launcher-turma/games`. Cada jogo recebe sua própria pasta e seu próprio `.venv`.

## Antes da apresentação

1. Preencha os 11 repositórios no `games.json`.
2. Confirme que cada repositório tem `main.py` e `requirements.txt` nos caminhos cadastrados.
3. Abra o launcher e instale todos os jogos enquanto houver internet.
4. Execute cada jogo pelo menos uma vez.
5. Não apague a pasta de dados do aplicativo antes da apresentação.
