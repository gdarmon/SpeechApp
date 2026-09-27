// Copy only reviewed source files; never upload a checkout containing local
// credentials, learner artifacts, Android signing material or Netlify state.
import { cp, lstat, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const artifacts = path.join(root, 'artifacts');
await mkdir(artifacts, { recursive: true });
const output = await mkdtemp(path.join(artifacts, 'vercel-probe-'));
for (const name of ['src', 'deploy/vercel-probe']) {
  await cp(path.join(root, name), path.join(output, name), {
    recursive: true, filter: async source => {
      const entry = await lstat(source);
      return !path.basename(source).startsWith('.')
        && (entry.isDirectory() || entry.isFile() && source.endsWith('.ts'));
    },
  });
}
for (const name of ['package.json', 'package-lock.json']) {
  await cp(path.join(root, name), path.join(output, name));
}
const tsconfig = JSON.parse(await readFile(path.join(root, 'tsconfig.json'), 'utf8'));
tsconfig.include = ['src/**/*.ts', 'deploy/vercel-probe/**/*.ts', 'api/**/*.ts'];
await writeFile(path.join(output, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2) + '\n');
await cp(path.join(root, 'deploy/vercel-probe/vercel.json'), path.join(output, 'vercel.json'));
await mkdir(path.join(output, 'api'));
await writeFile(path.join(output, 'api/probe.ts'),
  'export { default } from "../deploy/vercel-probe/handler.js";\n');
await mkdir(path.join(output, 'public'));
await writeFile(path.join(output, 'public/index.html'),
  '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="robots" content="noindex"><title>Fala diagnostics</title><p>Operator-only hosting comparison.</p></html>\n');
await writeFile(path.join(output, '.vercelignore'), '.env\n.env.*\n.vercel\nnode_modules\n');
console.log(JSON.stringify({ directory: output, credentials_copied: false, deployed: false }));
