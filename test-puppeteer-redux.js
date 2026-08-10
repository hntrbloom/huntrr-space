import puppeteer from 'puppeteer';

async function run() {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  await page.goto("https://www.pinterest.com/joycho/for-the-home/", { waitUntil: 'networkidle2' });
  
  let previousHeight = 0;
  for (let i = 0; i < 5; i++) {
    await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
    await new Promise(r => setTimeout(r, 1500));
    const newHeight = await page.evaluate('document.body.scrollHeight');
    if (newHeight === previousHeight) break;
    previousHeight = newHeight;
  }
  
  const reduxState = await page.evaluate(() => {
    // See if we can find the Redux store in the window object
    // Or we can just grab all script tags again
    // Actually, Redux state might be updated internally.
    return window.__PWS_DATA__; 
  });
  
  if (reduxState) {
     console.log("PWS_DATA exists.");
     const pins = reduxState.props?.initialReduxState?.pins;
     if (pins) {
        console.log("Found pins in Redux:", Object.keys(pins).length);
     }
  } else {
     // Let's grab it from DOM
     const pins = await page.evaluate(() => {
       return Array.from(document.querySelectorAll('a[href^="/pin/"]')).length;
     });
     console.log("Pin links found:", pins);
  }
  
  await browser.close();
}

run();
