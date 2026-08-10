import fetch from "node-fetch";

async function run() {
  let url = "https://pin.it/7LhT6r5";
  console.log("Original:", url);
  try {
    const res1 = await fetch(url, { redirect: "manual" });
    if (res1.status >= 300 && res1.status < 400 && res1.headers.get("location")) {
      let loc = res1.headers.get("location")!;
      if (loc.startsWith("/")) loc = "https://pin.it" + loc;
      
      console.log("Redirect 1:", loc);
      if (loc.includes("api.pinterest.com")) {
        const res2 = await fetch(loc, { redirect: "manual" });
        if (res2.status >= 300 && res2.status < 400 && res2.headers.get("location")) {
          url = res2.headers.get("location")!;
          console.log("Redirect 2:", url);
        } else {
          url = loc;
        }
      } else {
        url = loc;
      }
    }
  } catch (e) {
    console.error("Failed", e);
  }
  console.log("Final URL:", url);
}

run();
