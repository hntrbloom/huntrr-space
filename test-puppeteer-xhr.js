import puppeteer from 'puppeteer';

async function run() {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  const fetchedPins = new Set();
  
  page.on('response', async res => {
    const url = res.url();
    if (url.includes('BoardFeedResource/get')) {
      try {
        const data = await res.json();
        const pins = data?.resource_response?.data || [];
        pins.forEach(p => {
           if (p && p.id) fetchedPins.add(p.id);
        });
        console.log("XHR yielded", pins.length, "pins. Total unique:", fetchedPins.size);
      } catch(e) {}
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
  
  console.log("Total pins intercepted:", fetchedPins.size);
  await browser.close();
}

run();
