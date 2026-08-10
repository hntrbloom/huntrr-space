import React, { useState } from 'react';
import { X, Download, Archive, Loader2 } from 'lucide-react';
import { SmartImage } from './SmartImage';
import { downloadSingleImage, downloadImagesZip } from '../lib/downloadUtils';

export interface ImageToView {
  url: string;
  storagePath?: string;
  driveFileId?: string;
  title?: string;
  filename?: string;
}

export interface ImageViewerModalProps {
  image: ImageToView;
  allImages?: ImageToView[];
  zipTitle?: string;
  onClose: () => void;
}

export function ImageViewerModal({ image, allImages, zipTitle, onClose }: ImageViewerModalProps) {
  const [isDownloadingSingle, setIsDownloadingSingle] = useState(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);

  const title = image.title || image.filename || 'photo';

  const handleDownloadSingle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDownloadingSingle(true);
    try {
      await downloadSingleImage(image.url, title);
    } catch (err) {
      console.error('Download error:', err);
    } finally {
      setIsDownloadingSingle(false);
    }
  };

  const handleDownloadZip = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!allImages || allImages.length === 0) return;
    setIsDownloadingZip(true);
    try {
      const formatted = allImages.map((img, idx) => ({
        url: img.url,
        filename: img.filename || img.title || `${title}_photo_${idx + 1}`
      }));
      await downloadImagesZip(formatted, zipTitle || `${title}_photos.zip`);
    } catch (err) {
      console.error('Zip download error:', err);
    } finally {
      setIsDownloadingZip(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex flex-col items-center justify-between p-4 md:p-8 animate-in fade-in duration-200"
      onClick={onClose}
    >
      {/* Top action bar */}
      <div 
        className="w-full flex items-center justify-between z-10 max-w-7xl mx-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="text-white/90 text-sm font-semibold truncate max-w-[50vw]">
          {title}
        </div>

        <div className="flex items-center gap-2">
          {allImages && allImages.length > 1 && (
            <button
              onClick={handleDownloadZip}
              disabled={isDownloadingZip}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs md:text-sm font-bold transition-colors border border-white/20 backdrop-blur-sm disabled:opacity-50"
              title="Download all photos as ZIP archive"
            >
              {isDownloadingZip ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4 text-primary" />}
              <span className="hidden sm:inline">Download All ({allImages.length})</span>
            </button>
          )}

          <button
            onClick={handleDownloadSingle}
            disabled={isDownloadingSingle}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-white text-xs md:text-sm font-bold transition-colors hover:bg-primary/90 shadow-md border border-primary/30 disabled:opacity-50"
            title="Download photo"
          >
            {isDownloadingSingle ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span>Download Photo</span>
          </button>

          <button
            onClick={onClose}
            className="p-2.5 text-white/70 hover:text-white rounded-full hover:bg-white/10 transition-colors ml-2"
            title="Close"
          >
            <X className="w-7 h-7" />
          </button>
        </div>
      </div>

      {/* Main Image Stage */}
      <div 
        className="flex-1 w-full flex items-center justify-center p-2 my-2 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <SmartImage
          src={image.url}
          storagePath={image.storagePath}
          driveFileId={image.driveFileId}
          alt={title}
          className="max-w-full max-h-[80vh] md:max-h-[85vh] object-contain rounded-xl shadow-2xl"
        />
      </div>

      {/* Footer info */}
      <div className="text-white/60 text-xs text-center z-10 pb-2">
        Press ESC or tap outside to close
      </div>
    </div>
  );
}
