import {createRequire} from 'node:module';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const toolsRoot = resolve(process.env.BORROW_MOTION_TOOLS || resolve(root, '../.tooling/command-motion'));
const require = createRequire(resolve(toolsRoot, 'package.json'));
const expected = {'framer-motion': '14.1.0', gsap: '3.15.0', esbuild: '0.28.2'};
const versions = {};
for (const [name, version] of Object.entries(expected)) {
  const pkg = JSON.parse(await readFile(resolve(toolsRoot, 'node_modules', name, 'package.json'), 'utf8'));
  if (pkg.version !== version) throw new Error(`${name} must be ${version}, found ${pkg.version}`);
  versions[name] = pkg.version;
}
const {build} = require('esbuild');
const vendor = resolve(root, 'public/vendor');
await mkdir(vendor, {recursive: true});
await build({
  stdin: {contents: "export {animate} from 'framer-motion/dom/mini';", resolveDir: toolsRoot, sourcefile: 'motion-dom-entry.js'},
  outfile: resolve(vendor, 'motion-dom.js'), bundle: true, format: 'esm', target: ['es2022'],
  minify: true, legalComments: 'inline', banner: {js: '/* Framer Motion 14.1.0 DOM mini — MIT. See motion-LICENSE.md. */'},
});
const motionNotices = await Promise.all(['framer-motion', 'motion-dom', 'motion-utils'].map(async name =>
  `## ${name}\n\n${await readFile(resolve(toolsRoot, 'node_modules', name, 'LICENSE.md'), 'utf8')}`));
await writeFile(resolve(vendor, 'motion-LICENSE.md'), motionNotices.join('\n\n'));
// Official UMD dist mutates window.window and cannot be imported as strict ESM.
// Bundle the official package's ESM entry instead; no eval/CDN/global workaround.
await build({
  stdin: {contents: "export {gsap} from 'gsap';", resolveDir: toolsRoot, sourcefile: 'gsap-dom-entry.js'},
  outfile: resolve(vendor, 'gsap.min.js'), bundle: true, format: 'esm', target: ['es2022'],
  minify: true, legalComments: 'inline', banner: {js: '/*! GSAP 3.15.0 — Copyright 2026, GreenSock. All rights reserved. Subject to https://gsap.com/standard-license. See gsap-LICENSE.md. */'},
});
await writeFile(resolve(vendor, 'gsap-LICENSE.md'), '# GSAP 3.15.0\n\nCopyright 2026, GreenSock. All rights reserved.\n\nStandard No Charge GSAP License (not MIT): https://gsap.com/community/standard-license/\n\nThis library is used solely to animate the Borrow Lab interface. No visual animation builder is provided. The official distribution copyright header remains intact.\n');
await writeFile(resolve(vendor, 'motion-build.json'), JSON.stringify({versions, entries: ['framer-motion/dom/mini', 'gsap'], builtAt: new Date().toISOString(), scriptsDisabled: true}, null, 2) + '\n');
console.log(JSON.stringify({built: ['motion-dom.js', 'gsap.min.js'], versions}));
