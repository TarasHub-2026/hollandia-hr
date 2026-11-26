// Copies the MediaPipe WebAssembly runtime used by the profile picture face check into public/mediapipe,
// so the app serves it itself (nothing is loaded from a third-party site). Runs before dev and build.
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const to = join(root, 'public', 'mediapipe');
mkdirSync(to, { recursive: true });
for (const f of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm']) {
  const src = join(from, f);
  if (!existsSync(src)) { console.error(`Missing ${src}. Run npm install first.`); process.exit(1); }
  copyFileSync(src, join(to, f));
}
console.log('Copied MediaPipe runtime to public/mediapipe');
