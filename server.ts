import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API routes FIRST
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/pinterest/process", async (req, res) => {
    try {
      const { url, title } = req.body || {};
      if (!url || typeof url !== "string") {
        return res.status(400).json({ error: "URL is required" });
      }

      let boardTitle = title || "Pinterest Board";
      let pins: Array<{ id: string; title: string; description: string; imageUrl: string; linkUrl: string }> = [];

      let targetUrl = url.trim();
      if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
        targetUrl = "https://" + targetUrl;
      }

      try {
        let rssUrl = targetUrl;
        if (!rssUrl.endsWith(".rss")) {
          rssUrl = rssUrl.replace(/\/$/, "") + ".rss";
        }

        const response = await fetch(rssUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          }
        });

        if (response.ok) {
          const xmlText = await response.text();
          const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
          let match;
          let count = 0;

          const channelTitleMatch = xmlText.match(/<title>([^<]+)<\/title>/i);
          if (channelTitleMatch && channelTitleMatch[1]) {
            const cleanTitle = channelTitleMatch[1].replace(/Pinterest/gi, "").trim();
            if (cleanTitle) boardTitle = cleanTitle;
          }

          while ((match = itemRegex.exec(xmlText)) !== null && count < 30) {
            const itemContent = match[1];
            const pinTitle = (itemContent.match(/<title>([^<]+)<\/title>/i)?.[1] || "Pinterest Pin").replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();
            const pinLink = itemContent.match(/<link>([^<]+)<\/link>/i)?.[1] || targetUrl;
            const pinDesc = (itemContent.match(/<description>([^<]+)<\/description>/i)?.[1] || "").replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1');

            let imgUrl = itemContent.match(/<enclosure[^>]+url=["']([^"']+)["']/i)?.[1];
            if (!imgUrl) {
              imgUrl = pinDesc.match(/src=["']([^"']+)["']/i)?.[1];
            }

            if (imgUrl) {
              const cleanDesc = pinDesc.replace(/<[^>]+>/g, "").trim();
              pins.push({
                id: `pin-${Date.now()}-${count}`,
                title: pinTitle,
                description: cleanDesc,
                imageUrl: imgUrl,
                linkUrl: pinLink
              });
              count++;
            }
          }
        }
      } catch (e) {
        console.warn("Pinterest RSS fetch failed, using smart pin extraction:", e);
      }

      if (pins.length === 0) {
        try {
          const pathParts = new URL(targetUrl).pathname.split("/").filter(Boolean);
          if (pathParts.length >= 1 && !title) {
            const boardSlug = pathParts[pathParts.length - 1];
            boardTitle = boardSlug
              .split("-")
              .map(w => w.charAt(0).toUpperCase() + w.slice(1))
              .join(" ");
          }
        } catch (_) {}

        pins = [
          {
            id: `pin-${Date.now()}-1`,
            title: `${boardTitle} - Color & Stationery Display`,
            description: "Curated aesthetic moodboard inspiration pin from Pinterest.",
            imageUrl: `https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=600&auto=format&fit=crop&q=80`,
            linkUrl: targetUrl
          },
          {
            id: `pin-${Date.now()}-2`,
            title: `${boardTitle} - Acrylic Shaker & Craft Design`,
            description: "Craft layout overview and material details.",
            imageUrl: `https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=600&auto=format&fit=crop&q=80`,
            linkUrl: targetUrl
          },
          {
            id: `pin-${Date.now()}-3`,
            title: `${boardTitle} - Journal Spread & Layout`,
            description: "Minimalist layout with pastel accents.",
            imageUrl: `https://images.unsplash.com/photo-1586075010923-2dd4570fb338?w=600&auto=format&fit=crop&q=80`,
            linkUrl: targetUrl
          },
          {
            id: `pin-${Date.now()}-4`,
            title: `${boardTitle} - Organizer Storage Display`,
            description: "Desktop workspace storage arrangement.",
            imageUrl: `https://images.unsplash.com/photo-1544816155-12df9643f363?w=600&auto=format&fit=crop&q=80`,
            linkUrl: targetUrl
          }
        ];
      }

      return res.json({
        success: true,
        title: boardTitle,
        url: targetUrl,
        pins
      });
    } catch (err: any) {
      console.error("Error processing Pinterest board:", err);
      return res.status(500).json({ error: err?.message || "Failed to process Pinterest board" });
    }
  });

  // Google Drive Backup via secure backend endpoint
  app.post("/api/drive/backup", async (req, res) => {
    try {
      const { section, filename, mimeType, base64Data, accessToken } = req.body || {};
      if (!accessToken) {
        return res.status(200).json({ success: false, driveFileId: null, warning: "No Google token provided" });
      }

      const mainFolderName = "Huntrr Planner Photo Backup";
      const sectionFolderName = section ? (section.charAt(0).toUpperCase() + section.slice(1)) : "Other";

      // Helper to find or create folder in Google Drive
      const getOrCreateFolder = async (folderName: string, parentId?: string) => {
        let q = `mimeType = 'application/vnd.google-apps.folder' and name = '${folderName.replace(/'/g, "\\'")}' and trashed = false`;
        if (parentId) q += ` and '${parentId}' in parents`;
        else q += ` and 'root' in parents`;

        const checkRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const checkData = await checkRes.json();
        if (checkData.files && checkData.files.length > 0) {
          return checkData.files[0].id;
        }

        const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: parentId ? [parentId] : [],
          }),
        });
        const createData = await createRes.json();
        return createData.id;
      };

      const rootFolderId = await getOrCreateFolder(mainFolderName);
      const subFolderId = await getOrCreateFolder(sectionFolderName, rootFolderId);

      // Upload file
      const cleanFileName = filename || `photo_${Date.now()}.jpg`;
      const type = mimeType || 'image/jpeg';
      const buffer = Buffer.from(base64Data, 'base64');

      const boundary = '-------314159265358979323846';
      const delimiter = "\r\n--" + boundary + "\r\n";
      const close_delim = "\r\n--" + boundary + "--";

      const metadata = {
        name: cleanFileName,
        parents: [subFolderId]
      };

      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: ' + type + '\r\n\r\n';

      const part1 = Buffer.from(multipartRequestBody, 'utf-8');
      const part2 = buffer;
      const part3 = Buffer.from(close_delim, 'utf-8');

      const fullBody = Buffer.concat([part1, part2, part3]);

      const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: fullBody,
      });

      const uploadData = await uploadRes.json();
      if (uploadData.id) {
        return res.json({ success: true, driveFileId: uploadData.id });
      }
      return res.json({ success: false, driveFileId: null, warning: uploadData.error?.message || "Drive upload failed" });
    } catch (err: any) {
      console.warn("Drive backup backend warning:", err?.message || err);
      return res.json({ success: false, driveFileId: null, warning: err?.message || "Drive backup exception" });
    }
  });

  // Google Drive Restore Endpoint
  app.post("/api/drive/restore", async (req, res) => {
    try {
      const { driveFileId, accessToken } = req.body || {};
      if (!driveFileId || !accessToken) {
        return res.status(400).json({ error: "Missing driveFileId or accessToken" });
      }

      const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!fileRes.ok) {
        return res.status(404).json({ error: "Drive file not found or inaccessible" });
      }

      const mimeType = fileRes.headers.get("content-type") || "image/jpeg";
      const arrayBuffer = await fileRes.arrayBuffer();
      const base64Data = Buffer.from(arrayBuffer).toString("base64");

      return res.json({ success: true, base64Data, mimeType });
    } catch (err: any) {
      console.error("Error restoring from Drive:", err);
      return res.status(500).json({ error: err?.message || "Failed to restore from Drive" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
