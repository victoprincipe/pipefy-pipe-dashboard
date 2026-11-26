import { spawn } from 'node:child_process';

const children = [
  spawn('node', ['server/index.mjs', '--api-only'], { stdio: 'inherit' }),
  spawn('npx', ['vite', '--port', '5173'], { stdio: 'inherit' }),
];

function shutdown() {
  for (const child of children) {
    child.kill('SIGTERM');
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
