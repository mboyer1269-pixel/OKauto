import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const gitBash = join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'bin', 'bash.exe');
const bash = process.platform === 'win32' && existsSync(gitBash) ? gitBash : 'bash';

function isDockerReady() {
  const result = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], {
    stdio: 'ignore',
    windowsHide: true,
  });
  return result.status === 0;
}

async function ensureDockerDesktop() {
  if (process.platform !== 'win32' || isDockerReady()) return;

  const dockerDesktop = join(
    process.env.ProgramFiles ?? 'C:\\Program Files',
    'Docker',
    'Docker',
    'Docker Desktop.exe'
  );

  if (!existsSync(dockerDesktop)) return;

  console.log('==> Démarrage de Docker Desktop...');
  const dockerProcess = spawn(dockerDesktop, [], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  dockerProcess.unref();

  for (let attempt = 0; attempt < 90; attempt += 1) {
    if (isDockerReady()) {
      console.log('✓ Docker Desktop est prêt');
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.error('ERREUR: Docker Desktop ne répond pas après 90 secondes.');
  process.exit(1);
}

await ensureDockerDesktop();

const child = spawn(bash, ['scripts/start.sh'], {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('error', (error) => {
  console.error(`Impossible de lancer ${bash}:`, error.message);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exitCode = code ?? 1;
  }
});
