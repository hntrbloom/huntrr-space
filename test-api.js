import fetch from "node-fetch";

async function run() {
  const url = "http://localhost:3000/api/scrape-pinterest-board";
  const body = JSON.stringify({ boardUrl: "https://www.pinterest.com/joycho/for-the-home/" });
  
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body
  });
  
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    console.log(chunk);
  }
}

run();
