// Bundles src/main.js, three.js, the fonts and the styles into one self-contained index.html that works offline.
import fs from 'node:fs';
import esbuild from 'esbuild';

const font = (file, family, weight) =>
  `@font-face{font-family:'${family}';font-weight:${weight};font-style:normal;font-display:block;src:url(data:font/woff2;base64,${fs.readFileSync(file).toString('base64')}) format('woff2');}`;
const fonts = [
  font('node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2', 'Inter', '100 900'),
  ...[400, 600, 700].map((w) => font(`node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-${w}-normal.woff2`, 'JetBrains Mono', w)),
].join('\n');
const res = await esbuild.build({entryPoints: ['src/main.js'], bundle: true, format: 'esm', minify: true, write: false, target: 'es2022', legalComments: 'none'});
const js = res.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const css = fs.readFileSync('src/style.css', 'utf8');
fs.writeFileSync('index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Microelectronics Lab Simulation</title>
<style>
${fonts}
*{box-sizing:border-box}html,body{margin:0;height:100%}#app{position:fixed;inset:0}#gl{position:absolute;inset:0;width:100%;height:100%;display:block}
${css}
</style>
</head>
<body>
<div id="app"></div>
<script type="module">
${js}
</script>
</body>
</html>
`);
console.log(`index.html ${(fs.statSync('index.html').size / 1024).toFixed(0)} KB`);
