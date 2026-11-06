import { spawnSync } from 'node:child_process';

// Always use the versioned Maven Wrapper, regardless of the caller's directory.
const result = spawnSync(
  process.platform === 'win32' ? 'mvnw.cmd' : './mvnw',
  process.argv.slice(2),
  {
    cwd: new URL('../apps/api/', import.meta.url),
    stdio: 'inherit',
    shell: process.platform === 'win32',
  },
);

if (result.error) {
  console.error(`Cannot start Maven Wrapper: ${result.error.message}`);
}
process.exit(result.status ?? 1);
