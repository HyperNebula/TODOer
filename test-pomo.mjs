import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  
  await page.goto('http://localhost:1420/');
  
  // Wait for the button
  try {
    await page.waitForSelector('button[title="Open Pomodoro Timer"]', { timeout: 5000 });
    console.log("Found Pomodoro button");
    await page.click('button[title="Open Pomodoro Timer"]');
    console.log("Clicked Pomodoro button");
    await new Promise(r => setTimeout(r, 2000)); // wait to see what happens
  } catch (e) {
    console.log("Could not find or click button:", e);
  }
  
  await browser.close();
})();
