import fetch from "node-fetch";

async function run() {
  const url = "https://www.pinterest.com/joycho/for-the-home/";
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1"
  };

  const res1 = await fetch(url, { headers });
  const html = await res1.text();
  
  const setCookie = res1.headers.raw()['set-cookie'] || [];
  const cookies = setCookie.map(c => c.split(';')[0]).join('; ');
  
  const csrfMatch = cookies.match(/csrftoken=([^;]+)/);
  const csrf = csrfMatch ? csrfMatch[1] : "";
  
  const m = html.match(/<script[^>]*id="__PWS_DATA__"[^>]*>(.*?)<\/script>/s);
  let appVersion = "";
  if(m) {
     const data = JSON.parse(m[1]);
     appVersion = data.appVersion || "";
  }
  
  console.log("Cookies:", cookies);
  console.log("CSRF:", csrf);
  console.log("AppVersion:", appVersion);

  const optionsObj = { username: "joycho", slug: "for-the-home", page_size: 25 };
  const apiUrl = `https://www.pinterest.com/resource/BoardFeedResource/get/?source_url=/joycho/for-the-home/&data=${encodeURIComponent(JSON.stringify({ options: optionsObj, context: {} }))}`;

  const res2 = await fetch(apiUrl, {
    headers: {
      ...headers,
      "X-Requested-With": "XMLHttpRequest",
      "X-CSRFToken": csrf,
      "X-Pinterest-App-Version": appVersion,
      "X-Pinterest-PWS-Handler": "www_board",
      "Cookie": cookies,
      "Accept": "application/json"
    }
  });

  console.log("Status:", res2.status);
  const data = await res2.text();
  console.log("Response starts with:", data.substring(0, 100));
}

run();
