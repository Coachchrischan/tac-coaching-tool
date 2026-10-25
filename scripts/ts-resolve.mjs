// Lets a plain Node script import the app's TypeScript libs (src/lib/*.ts)
// without a build: Node 24 strips types natively, but the app's relative
// imports are extensionless (or end in .js for the Vite plugins), which the
// ESM resolver refuses. This hook tries the .ts twin before giving up.
//
//   node --import ./scripts/ts-resolve.mjs scripts/whatever.mjs
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register(
  'data:text/javascript,' +
    encodeURIComponent(`
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    const base = new URL(specifier, context.parentURL);
    const candidates = [base.href.replace(/\\.js$/, '.ts'), base.href + '.ts', base.href + '/index.ts'];
    for (const c of candidates) {
      if (!c.endsWith('.ts')) continue;
      if (existsSync(fileURLToPath(c))) return { url: c, shortCircuit: true, format: 'module-typescript' };
    }
  }
  return next(specifier, context);
}
`),
  pathToFileURL('./'),
);
