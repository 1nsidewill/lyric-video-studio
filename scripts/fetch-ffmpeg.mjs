/**
 * Provisions the bundled FFmpeg sidecar for the current platform.
 *
 * Copies the static binary shipped by the `ffmpeg-static` dev-dependency into
 *   src-tauri/binaries/ffmpeg-<rust-host-target-triple>[.exe]
 * which is the exact name Tauri's `externalBin` resolver expects.
 *
 * Run locally after `npm install` (`npm run fetch-ffmpeg`); CI runs it on each
 * OS runner before `tauri build`. The binaries/ folder is git-ignored.
 */
import { existsSync, mkdirSync, copyFileSync, chmodSync, statSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ffmpegPath = require('ffmpeg-static');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const binariesDir = join(root, 'src-tauri', 'binaries');

// Rust host target triple, e.g. aarch64-apple-darwin / x86_64-pc-windows-msvc
let triple;
try {
  triple = execSync('rustc -vV', { encoding: 'utf8' })
    .split('\n')
    .find((l) => l.startsWith('host:'))
    .replace('host:', '')
    .trim();
} catch {
  console.error('✗ Could not run `rustc -vV`. Install the Rust toolchain first: https://rustup.rs');
  process.exit(1);
}

if (!ffmpegPath || !existsSync(ffmpegPath)) {
  console.error('✗ ffmpeg-static did not provide a binary for this platform.');
  process.exit(1);
}

const isWin = process.platform === 'win32';
const dest = join(binariesDir, `ffmpeg-${triple}${isWin ? '.exe' : ''}`);

mkdirSync(binariesDir, { recursive: true });
rmSync(dest, { force: true }); // a prior copy may be read-only (mode 555)
copyFileSync(ffmpegPath, dest);
if (!isWin) chmodSync(dest, 0o755);

const mb = (statSync(dest).size / 1024 / 1024).toFixed(1);
console.log(`✔ FFmpeg sidecar ready: ${dest} (${mb} MB)`);
