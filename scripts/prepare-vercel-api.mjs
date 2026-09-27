// Stage only reviewed API sources. No environment files or local credentials.
import { cp, lstat, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
await mkdir('artifacts', { recursive: true });
const output = await mkdtemp(path.join(root, 'artifacts/vercel-api-'));
for (const name of ['src', 'deploy/vercel-api', 'deploy/vercel-probe']) await cp(name, path.join(output, name), { recursive: true,
  filter: async source => { const entry = await lstat(source); return !path.basename(source).startsWith('.') && (entry.isDirectory() || entry.isFile() && source.endsWith('.ts')); } });
for (const name of ['package.json', 'package-lock.json']) await cp(name, path.join(output, name));
const config = JSON.parse(await readFile('tsconfig.json', 'utf8'));
config.include = ['src/**/*.ts', 'deploy/**/*.ts', 'api/**/*.ts'];
await writeFile(path.join(output, 'tsconfig.json'), JSON.stringify(config, null, 2) + '\n');
await cp('deploy/vercel-api/vercel.json', path.join(output, 'vercel.json'));
await mkdir(path.join(output, 'api'));
await writeFile(path.join(output, 'api/service.ts'), 'export { default } from "../deploy/vercel-api/handler.js";\n');
await cp('public', path.join(output, 'public'), { recursive: true, filter: async source => { const entry = await lstat(source); return !path.basename(source).startsWith('.') && !entry.isSymbolicLink(); } });
await writeFile(path.join(output, 'public/robots.txt'), 'User-agent: *\nDisallow: /\n');
await writeFile(path.join(output, '.vercelignore'), '.env\n.env.*\n.vercel\nnode_modules\n');
console.log(JSON.stringify({ directory: output, credentials_copied: false }));
