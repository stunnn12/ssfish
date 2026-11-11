// Kiểm tra tên file trong dist/ theo yêu cầu YouTube Playables (Technical Requirements 1.9):
// chỉ được dùng chữ cái, chữ số và các ký tự _ - .
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const SAFE = /^[A-Za-z0-9_.-]+$/;

const bad = [];
let count = 0;
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (!SAFE.test(entry.name)) bad.push(relative(root, full));
    if (entry.isDirectory()) walk(full);
    else count++;
  }
})(root);

if (bad.length) {
  console.error(`✗ ${bad.length} tên file/thư mục có ký tự không hợp lệ (chỉ cho phép A-Z a-z 0-9 _ - .):`);
  for (const p of bad) console.error('  ' + p);
  process.exit(1);
}
console.log(`✓ ${count} file trong dist/ đều có tên hợp lệ cho Playables.`);
