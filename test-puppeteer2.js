import puppeteer from 'puppeteer';

async function run() {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (['stylesheet', 'font', 'media'].includes(req.resourceType())) {
      req.abort();
    } else {
      req.continue();
    }
  });

  await page.goto("https://www.pinterest.com/joycho/for-the-home/", { waitUntil: 'networkidle2' });
  
  let previousHeight = 0;
  for (let i = 0; i < 5; i++) {
    await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
    await new Promise(r => setTimeout(r, 1000));
    const newHeight = await page.evaluate('document.body.scrollHeight');
    if (newHeight === previousHeight) break;
    previousHeight = newHeight;
  }
  
  const pins = await page.evaluate(() => {
    const images = document.querySelectorAll('img');
    const result = [];
    images.forEach(img => {
      if (img.src && img.src.includes('i.pinimg.com')) {
         result.push({
           url: img.src,
           alt: img.alt || ''
         });
      }
    });
    return result;
  });
  
  console.log("Found pins:", pins.length);
  await browser.close();
}

run();
