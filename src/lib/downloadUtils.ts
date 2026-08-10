import { saveAs } from 'file-saver';
import JSZip from 'jszip';

export async function fetchBlobWithFallback(url: string): Promise<Blob> {
  if (url.startsWith('data:')) {
    const res = await fetch(url);
    return await res.blob();
  }
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    return await res.blob();
  } catch (err) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas context failed'));
        ctx.drawImage(img, 0, 0);
        let mime = 'image/png';
        if (url.toLowerCase().includes('.jpg') || url.toLowerCase().includes('.jpeg')) {
          mime = 'image/jpeg';
        } else if (url.toLowerCase().includes('.webp')) {
          mime = 'image/webp';
        }
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas toBlob failed'));
        }, mime, 1.0);
      };
      img.onerror = () => reject(new Error('Image failed to load for download'));
      img.src = url;
    });
  }
}

export async function downloadSingleImage(url: string, suggestedName: string) {
  try {
    const blob = await fetchBlobWithFallback(url);
    let ext = 'png';
    if (blob.type) {
      const mimeExt = blob.type.split('/')[1]?.split('+')[0];
      if (mimeExt) ext = mimeExt === 'jpeg' ? 'jpg' : mimeExt;
    }
    const cleanName = suggestedName.trim().replace(/[^a-zA-Z0-9_.-]/g, '_');
    const finalName = cleanName.toLowerCase().endsWith(`.${ext}`) ? cleanName : `${cleanName}.${ext}`;
    saveAs(blob, finalName);
  } catch (e: any) {
    console.error("Failed to download image:", e);
    const a = document.createElement('a');
    a.href = url;
    a.download = suggestedName;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

export async function downloadImagesZip(
  images: { url: string; filename: string }[],
  zipFilename: string
) {
  if (!images || images.length === 0) return;
  const zip = new JSZip();
  const nameCounts: Record<string, number> = {};

  for (const img of images) {
    if (!img.url) continue;
    try {
      const blob = await fetchBlobWithFallback(img.url);
      let ext = 'png';
      if (blob.type) {
        const mimeExt = blob.type.split('/')[1]?.split('+')[0];
        if (mimeExt) ext = mimeExt === 'jpeg' ? 'jpg' : mimeExt;
      }
      const cleanBase = (img.filename || 'photo').trim().replace(/[^a-zA-Z0-9_.-]/g, '_');
      nameCounts[cleanBase] = (nameCounts[cleanBase] || 0) + 1;
      const count = nameCounts[cleanBase];
      const entryName = count > 1 ? `${cleanBase}_${count}.${ext}` : `${cleanBase}.${ext}`;
      zip.file(entryName, blob);
    } catch (e) {
      console.warn(`Failed adding ${img.filename} to zip:`, e);
    }
  }

  const cleanZipName = zipFilename.trim().replace(/[^a-zA-Z0-9_.-]/g, '_');
  const finalZipName = cleanZipName.toLowerCase().endsWith('.zip') ? cleanZipName : `${cleanZipName}.zip`;
  const content = await zip.generateAsync({ type: 'blob' });
  saveAs(content, finalZipName);
}
