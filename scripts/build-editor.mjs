#!/usr/bin/env node
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

await esbuild.build({
  entryPoints: [join(root, 'src/editor/index.js')],
  bundle: true,
  format: 'iife',
  globalName: 'RichTextEditor',
  outfile: join(root, 'public/js/editor-bundle.js'),
  minify: process.env.NODE_ENV === 'production',
  sourcemap: process.env.NODE_ENV !== 'production',
  target: ['es2020'],
  loader: { '.js': 'js' }
}).catch(() => process.exit(1));
