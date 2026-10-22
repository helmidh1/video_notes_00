#!/usr/bin/env node
import { spawn } from 'node:child_process';
import process from 'node:process';
import fs from 'node:fs';

const isWin = process.platform === 'win32';
const preferred = isWin ? 'python' : 'python3';
const fallback = isWin ? 'python3' : 'python';
const args = ['companion/caption_bridge.py', ...process.argv.slice(2)];

const env = { ...process.env };
if (!isWin && !env.AT_SPI_BUS_ADDRESS && process.getuid) {
  const busPath = `/run/user/${process.getuid()}/at-spi/bus_0`;
  if (fs.existsSync(busPath)) {
    env.AT_SPI_BUS_ADDRESS = `unix:path=${busPath}`;
  }
}

function run(cmd, secondary) {
  const child = spawn(cmd, args, { stdio: 'inherit', env });

  child.on('error', (err) => {
    if (err.code === 'ENOENT' && secondary) {
      run(secondary, null);
    } else {
      console.error(`\n[ERROR] Could not start Python using '${cmd}'.`);
      console.error(`Please ensure Python 3 is installed and added to your PATH.\n`);
      process.exit(1);
    }
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

run(preferred, fallback);
