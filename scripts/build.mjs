// dist/index.html（GitHub Pages などで単体で開くページ）と dist/artifact.html（共有用の断片）を作る
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const out = await build({ entryPoints: ['src/main.ts'], bundle: true, minify: true, format: 'iife', target: 'es2020', write: false });
const js = out.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const css = readFileSync('src/ui/style.css', 'utf8');
const shell = readFileSync('src/ui/shell.html', 'utf8');
const fonts = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;700&family=Dela+Gothic+One&family=IBM+Plex+Mono:wght@500;600&family=Klee+One:wght@400;600&family=Zen+Kaku+Gothic+New:wght@500;700&display=swap">';

const head = `<title>Chemyth</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n${fonts}\n<style>\n${css}</style>\n`;
const body = `${shell}<script>\n${js}</script>\n`;
const page = head + body;

mkdirSync('dist', { recursive: true });
writeFileSync('dist/artifact.html', page);
writeFileSync('dist/index.html', [
  '<!doctype html>',
  '<html lang="ja">',
  '<head>',
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">',
  '<meta name="description" content="大学受験化学を、工場を組みながら覚えるパズル。">',
  head + '</head>',
  '<body style="margin:0">',
  body + '</body>',
  '</html>',
  '',
].join('\n'));
console.log(`built: ${(page.length / 1024).toFixed(1)} KB`);
