/**
 * Free a TCP port on Windows (dev helper).
 * Usage: node scripts/free-port.mjs 3000
 */
import { execSync } from 'node:child_process';

const port = process.argv[2] || '3000';

if (process.platform !== 'win32') {
  console.log(`(skip) free-port helper is Windows-only; port ${port}`);
  process.exit(0);
}

try {
  const output = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
  const pids = new Set();
  for (const line of output.split('\n')) {
    const match = line.trim().match(/LISTENING\s+(\d+)\s*$/i);
    if (match) pids.add(match[1]);
  }
  if (pids.size === 0) {
    console.log(`Port ${port} is not in use.`);
    process.exit(0);
  }
  for (const pid of pids) {
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
      console.log(`Stopped process ${pid} on port ${port}`);
    } catch {
      console.warn(`Could not stop PID ${pid}`);
    }
  }
} catch {
  console.log(`Port ${port} is not in use.`);
}
