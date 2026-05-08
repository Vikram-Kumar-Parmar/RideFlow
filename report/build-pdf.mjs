import puppeteer from '/home/ubuntu/.nvm/versions/node/v22.12.0/lib/node_modules/@mermaid-js/mermaid-cli/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath  = path.join(__dirname, 'report.html');
const pdfPath   = path.join(__dirname, 'RideFlow_D3_Report.pdf');

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.goto('file://' + htmlPath, { waitUntil: 'networkidle0', timeout: 90000 });
await page.pdf({
  path: pdfPath,
  format: 'A4',
  printBackground: true,
  margin: { top: '14mm', bottom: '14mm', left: '14mm', right: '14mm' },
});
await browser.close();
console.log('OK ' + pdfPath);
