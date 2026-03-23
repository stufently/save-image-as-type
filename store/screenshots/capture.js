const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const mockups = ['mockup1', 'mockup2', 'mockup3', 'mockup4', 'mockup5'];

  for (const name of mockups) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    const htmlPath = path.join(__dirname, `${name}.html`);
    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });

    const outputPath = path.join(__dirname, `${name}.png`);
    await page.screenshot({ path: outputPath, type: 'png' });
    console.log(`Saved ${outputPath}`);
    await page.close();
  }

  await browser.close();
})();
