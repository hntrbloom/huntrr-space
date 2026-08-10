export interface ProcessedImageResult {
  optimizedFile: File;
  thumbnailFile: File;
  width: number;
  height: number;
  mimeType: string;
  filename: string;
  previewUrl: string;
}

/**
 * Compresses an image file according to prompt specs:
 * 1. Resizes proportionally to max 1600 px on longest side.
 * 2. Converts to WebP at ~78% quality (target size 300-600 KB).
 * 3. Preserves transparency when present.
 * 4. Fallback to JPEG at 80% if WebP is unsupported/fails.
 * 5. Generates separate 480 px thumbnail in WebP ~70% quality.
 */
export async function processAndCompressImage(file: File | Blob): Promise<ProcessedImageResult> {
  if (!file) {
    throw new Error('No file provided for compression');
  }

  const hasAlpha = file.type === 'image/png' || file.type === 'image/webp' || file.type === 'image/gif';

  // Attempt EXIF-aware decoding with createImageBitmap
  let bitmap: ImageBitmap | null = null;
  try {
    if (typeof createImageBitmap === 'function') {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    }
  } catch (bitmapErr) {
    console.warn('createImageBitmap with EXIF orientation failed, falling back to Image loader:', bitmapErr);
  }

  if (bitmap) {
    try {
      const origWidth = bitmap.width;
      const origHeight = bitmap.height;

      const opt = await createResizedBlobFromSource(bitmap, origWidth, origHeight, 1600, 0.78, hasAlpha);
      const thumb = await createResizedBlobFromSource(bitmap, origWidth, origHeight, 480, 0.70, hasAlpha);

      bitmap.close();

      const rawName = (file as any).name || 'photo';
      const baseName = rawName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_.-]/g, '_');
      const optExt = opt.mimeType === 'image/webp' ? 'webp' : 'jpg';
      const thumbExt = thumb.mimeType === 'image/webp' ? 'webp' : 'jpg';

      const optFilename = `${baseName}_1600.${optExt}`;
      const thumbFilename = `${baseName}_thumb.${thumbExt}`;

      const optimizedFile = new File([opt.blob], optFilename, { type: opt.mimeType, lastModified: Date.now() });
      const thumbnailFile = new File([thumb.blob], thumbFilename, { type: thumb.mimeType, lastModified: Date.now() });
      const previewUrl = URL.createObjectURL(opt.blob);

      return {
        optimizedFile,
        thumbnailFile,
        width: opt.width,
        height: opt.height,
        mimeType: opt.mimeType,
        filename: (file as any).name || optFilename,
        previewUrl
      };
    } catch (err) {
      if (bitmap) bitmap.close();
      throw err;
    }
  }

  // Fallback to HTMLImageElement
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = async () => {
      try {
        const origWidth = img.naturalWidth || img.width || 800;
        const origHeight = img.naturalHeight || img.height || 600;

        const opt = await createResizedBlobFromSource(img, origWidth, origHeight, 1600, 0.78, hasAlpha);
        const thumb = await createResizedBlobFromSource(img, origWidth, origHeight, 480, 0.70, hasAlpha);

        URL.revokeObjectURL(objectUrl);

        const rawName = (file as any).name || 'photo';
        const baseName = rawName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_.-]/g, '_');
        const optExt = opt.mimeType === 'image/webp' ? 'webp' : 'jpg';
        const thumbExt = thumb.mimeType === 'image/webp' ? 'webp' : 'jpg';

        const optFilename = `${baseName}_1600.${optExt}`;
        const thumbFilename = `${baseName}_thumb.${thumbExt}`;

        const optimizedFile = new File([opt.blob], optFilename, { type: opt.mimeType, lastModified: Date.now() });
        const thumbnailFile = new File([thumb.blob], thumbFilename, { type: thumb.mimeType, lastModified: Date.now() });
        const previewUrl = URL.createObjectURL(opt.blob);

        resolve({
          optimizedFile,
          thumbnailFile,
          width: opt.width,
          height: opt.height,
          mimeType: opt.mimeType,
          filename: (file as any).name || optFilename,
          previewUrl
        });
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Unable to decode photo format (${file.type || 'unknown'}). Please select a JPEG, WebP, or PNG image.`));
    };

    img.src = objectUrl;
  });
}

async function createResizedBlobFromSource(
  source: HTMLImageElement | ImageBitmap,
  srcW: number,
  srcH: number,
  maxDim: number,
  quality: number,
  preserveAlpha: boolean
): Promise<{ blob: Blob; width: number; height: number; mimeType: string }> {
  let w = srcW;
  let h = srcH;

  if (w > maxDim || h > maxDim) {
    if (w > h) {
      h = Math.round((h * maxDim) / w);
      w = maxDim;
    } else {
      w = Math.round((w * maxDim) / h);
      h = maxDim;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d', { alpha: preserveAlpha });
  if (!ctx) {
    throw new Error('Could not obtain canvas 2D context');
  }

  if (!preserveAlpha) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.clearRect(0, 0, w, h);
  }

  ctx.drawImage(source, 0, 0, w, h);

  // Attempt WebP export
  let blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', quality));
  let mimeType = 'image/webp';

  if (!blob || blob.size === 0) {
    // Fallback to JPEG at 80%
    blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.80));
    mimeType = 'image/jpeg';
  }

  if (!blob) {
    throw new Error('Failed to generate image blob from canvas');
  }

  return { blob, width: w, height: h, mimeType };
}
