import { spawn } from 'node:child_process';

const PORT = String(process.env.PORT || '3000');
const TARGET_URL = `http://localhost:${PORT}`;
const NPM_BIN = process.platform === 'win32' ? 'npm.cmd' : 'npm';

let shuttingDown = false;
let printedBanner = false;

const devProcess = spawn(NPM_BIN, ['run', 'dev', '--', '--port', PORT], {
  stdio: 'inherit',
  env: { ...process.env, PORT },
});

const tunnelProcess = spawn('cloudflared', ['tunnel', '--url', TARGET_URL], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: process.env,
});

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  if (!tunnelProcess.killed) {
    tunnelProcess.kill('SIGTERM');
  }
  if (!devProcess.killed) {
    devProcess.kill('SIGTERM');
  }

  setTimeout(() => {
    process.exit(exitCode);
  }, 150);
}

function handleTunnelOutput(chunk, targetStream) {
  const text = chunk.toString();
  targetStream.write(text);

  if (!printedBanner) {
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (match) {
      printedBanner = true;
      const publicUrl = match[0];
      console.log('\n============================================================');
      console.log(`[tunnel] App disponível em: ${publicUrl}`);
      console.log(`[tunnel] Manifest Pipefy:   ${publicUrl}/manifest.json`);
      console.log('============================================================\n');
    }
  }
}

tunnelProcess.stdout.on('data', (chunk) => handleTunnelOutput(chunk, process.stdout));
tunnelProcess.stderr.on('data', (chunk) => handleTunnelOutput(chunk, process.stderr));

tunnelProcess.on('error', (err) => {
  if ('code' in err && err.code === 'ENOENT') {
    console.error(
      '\n[dev:tunnel] "cloudflared" não encontrado no PATH. Instale com: brew install cloudflared\n'
    );
  } else {
    console.error(`[dev:tunnel] Erro ao iniciar cloudflared: ${err.message}`);
  }
  shutdown(1);
});

devProcess.on('error', (err) => {
  console.error(`[dev:tunnel] Erro ao iniciar next dev: ${err.message}`);
  shutdown(1);
});

tunnelProcess.on('exit', (code) => {
  if (!shuttingDown) {
    shutdown(code ?? 0);
  }
});

devProcess.on('exit', (code) => {
  if (!shuttingDown) {
    shutdown(code ?? 0);
  }
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
