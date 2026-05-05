import puppeteer from '/home/ubuntu/.nvm/versions/node/v22.12.0/lib/node_modules/@mermaid-js/mermaid-cli/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mdPath  = path.join(__dirname, 'KEYBOOK.md');
const pdfPath = path.join(__dirname, 'RideFlow_Keybook.pdf');

const md = fs.readFileSync(mdPath, 'utf-8');
const bodyHtml = execSync('pandoc -f markdown -t html5', { input: md }).toString();

const html = `<!doctype html><html><head><meta charset="utf-8"><title>RideFlow Viva Keybook</title>
<style>
@page { size: A4; margin: 18mm 18mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font: 11pt/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Arial, sans-serif;
  color: #111;
}
h1 { font-size: 20pt; color: #0e7490; margin: 0 0 6pt; }
h2 { font-size: 14pt; color: #0e7490; margin: 18pt 0 6pt; padding-bottom: 4pt; border-bottom: 1.2pt solid #0e7490; }
h3 { font-size: 12pt; color: #0f172a; margin: 12pt 0 4pt; }
p, li { margin: 4pt 0; }
ul, ol { margin: 4pt 0 4pt 18pt; }
code { font-family: "JetBrains Mono", "Fira Code", Menlo, Consolas, monospace; font-size: 9.5pt; background: #f1f5f9; padding: 1pt 4pt; border-radius: 2pt; }
pre { background: #0f172a; color: #e2e8f0; padding: 8pt 10pt; border-radius: 3pt; font-size: 9.5pt; line-height: 1.4; white-space: pre-wrap; word-break: break-word; }
pre code { background: transparent; color: inherit; padding: 0; font-size: inherit; }
table { border-collapse: collapse; width: 100%; margin: 6pt 0; font-size: 10pt; }
th, td { border: 0.5pt solid #cbd5e1; padding: 4pt 6pt; text-align: left; vertical-align: top; }
th { background: #f1f5f9; }
blockquote { border-left: 3pt solid #0e7490; padding: 4pt 12pt; margin: 6pt 0; background: #ecfeff; color: #0e7490; font-style: italic; }
hr { border: 0; border-top: 0.5pt solid #cbd5e1; margin: 14pt 0; }
strong { color: #0f172a; }
em { color: #475569; }
.cover { text-align: center; padding-top: 60pt; margin-bottom: 40pt; border-bottom: 0.5pt solid #cbd5e1; padding-bottom: 24pt; }
.cover .badge { display: inline-block; padding: 2pt 8pt; border-radius: 3pt; background: #ecfeff; color: #0e7490; font-size: 10pt; font-weight: 600; }
.cover h1 { font-size: 28pt; margin: 12pt 0 6pt; }
.cover .subtitle { font-size: 11pt; color: #475569; }
.cover .team { margin-top: 18pt; font-size: 11pt; }
</style></head><body>
<div class="cover">
  <div class="badge">Database Systems · Spring 2026</div>
  <h1>RideFlow Viva Keybook</h1>
  <div class="subtitle">Demo script, expected questions, and key concepts</div>
  <div class="team">
    Vikram Kumar (23K-2062) and Umar Behram (23I-2604) &mdash; Section DS-4B
  </div>
</div>
${bodyHtml}
</body></html>`;

const tmpHtml = path.join(__dirname, '_keybook.html');
fs.writeFileSync(tmpHtml, html);

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.goto('file://' + tmpHtml, { waitUntil: 'networkidle0' });
await page.pdf({
  path: pdfPath,
  format: 'A4',
  printBackground: true,
  margin: { top: '14mm', bottom: '14mm', left: '14mm', right: '14mm' },
});
await browser.close();
fs.unlinkSync(tmpHtml);
console.log('OK ' + pdfPath);
