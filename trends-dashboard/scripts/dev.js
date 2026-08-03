// Run once, leave running. Polls the branch for new commits, pulls them, and
// lets `node --watch` restart the server when the pulled files land.
const { spawn, execFile } = require('child_process');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const POLL_INTERVAL_MS = Number(process.env.DEV_POLL_MS || 30_000);

function git(args) {
  return new Promise((resolve, reject) => {
    execFile('git', ['-C', REPO_ROOT, ...args], (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message).trim()));
      resolve(stdout.trim());
    });
  });
}

async function currentBranch() {
  return git(['rev-parse', '--abbrev-ref', 'HEAD']);
}

async function hasLocalEdits() {
  const status = await git(['status', '--porcelain']);
  return status.length > 0;
}

async function pullIfBehind(branch) {
  await git(['fetch', 'origin', branch]);

  const [local, remote] = await Promise.all([
    git(['rev-parse', 'HEAD']),
    git(['rev-parse', `origin/${branch}`]),
  ]);
  if (local === remote) return false;

  // Pulling over local edits turns a convenience into a merge conflict.
  if (await hasLocalEdits()) {
    console.log('\n[dev] Nouveaux commits disponibles, mais des fichiers sont modifiés en local.');
    console.log('[dev] Mise à jour ignorée — committe ou annule tes changements pour la reprendre.\n');
    return false;
  }

  console.log('\n[dev] Nouveaux commits détectés, récupération…');
  await git(['merge', '--ff-only', `origin/${branch}`]);
  const subject = await git(['log', '-1', '--pretty=%s']);
  console.log(`[dev] À jour : ${subject}`);
  console.log('[dev] Le serveur redémarre tout seul.\n');
  return true;
}

const server = spawn('node', ['--watch', 'server.js'], {
  cwd: path.join(__dirname, '..'),
  stdio: 'inherit',
});

server.on('exit', (code) => process.exit(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.kill(signal);
    process.exit(0);
  });
}

(async () => {
  let branch;
  try {
    branch = await currentBranch();
  } catch (err) {
    console.log(`[dev] Suivi git désactivé (${err.message}). Le serveur tourne quand même.`);
    return;
  }

  console.log(`[dev] Surveillance de origin/${branch} toutes les ${POLL_INTERVAL_MS / 1000}s.`);
  console.log('[dev] Laisse cette fenêtre ouverte — plus rien à taper.\n');

  setInterval(() => {
    pullIfBehind(branch).catch((err) => console.log(`[dev] Vérification échouée : ${err.message}`));
  }, POLL_INTERVAL_MS);
})();
