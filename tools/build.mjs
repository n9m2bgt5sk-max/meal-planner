// Writes sw.js with the list of files to keep offline and a version that changes whenever they do.
import { readdirSync, statSync, readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';

const root = new URL('..', import.meta.url).pathname;
const include = ['index.html', 'manifest.webmanifest', 'css', 'js', 'icons', 'vendor/fonts', 'vendor/qrcode'];
const files = [];
function walk(p) {
  const full = join(root, p);
  if (statSync(full).isDirectory()) for (const f of readdirSync(full)) walk(join(p, f));
  else files.push(p);
}
include.forEach(walk);
const hash = createHash('sha1');
for (const f of files.sort()) hash.update(f).update(readFileSync(join(root, f)));
const version = hash.digest('hex').slice(0, 10);
const tpl = readFileSync(join(root, 'tools/sw.template.js'), 'utf8');
writeFileSync(join(root, 'sw.js'), tpl.replace('__VERSION__', version).replace('__ASSETS__', JSON.stringify(['./', ...files], null, 1)));
console.log(`sw.js: ${files.length} files, version ${version}`);
