import React, { useState, useRef, useEffect } from 'react';
import { Image as ImageIcon, Upload, X, Check, Droplet } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { uploadFileToStorage } from '../lib/storage';

export function ColorSampler({ initialImageUrl, onSave, onCancel }: { initialImageUrl?: string, onSave: (color: any) => void, onCancel: () => void }) {
  const { user } = useAuth();
  const [photoUrl, setPhotoUrl] = useState<string | null>(initialImageUrl || null);
  const [photoStoragePath, setPhotoStoragePath] = useState<string | null>(null);
  const [point, setPoint] = useState<{ x: number, y: number } | null>(null);
  const [hex, setHex] = useState<string>('#FFB8CD');
  const [name, setName] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleUpload = async (e: any) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsUploading(true);
      try {
        const reader = new FileReader();
        reader.onload = async (ev) => {
           const dataUrl = ev.target?.result as string;
           setPhotoUrl(dataUrl);
           if (user) {
             const img = new Image();
             img.onload = async () => {
               const canvas = document.createElement('canvas');
               let w = img.width, h = img.height;
               const max = 1200;
               if (w > max || h > max) {
                 if (w > h) { h = Math.round(h * (max/w)); w = max; }
                 else { w = Math.round(w * (max/h)); h = max; }
               }
               canvas.width = w; canvas.height = h;
               const ctx = canvas.getContext('2d');
               if (ctx) {
                 ctx.drawImage(img, 0, 0, w, h);
                 canvas.toBlob(async (blob) => {
                   if (blob) {
                     const f = new File([blob], file.name, { type: 'image/jpeg' });
                     const res = await uploadFileToStorage(user.uid, 'characterWikiColors', f);
                     setPhotoStoragePath(res.path);
                   }
                   setIsUploading(false);
                 }, 'image/jpeg', 0.6);
               } else {
                 setIsUploading(false);
               }
             };
             img.src = dataUrl;
           } else {
             setIsUploading(false);
           }
        };
        reader.readAsDataURL(file);
      } catch (err) {
        setIsUploading(false);
      }
    }
  };

  const handleInteract = (e: any) => {
    if (!photoUrl || !canvasRef.current || !containerRef.current) return;
    
    // Support both mouse and touch
    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, clientY - rect.top));

    // Get color
    const ctx = canvasRef.current.getContext('2d');
    if (ctx) {
      const scaleX = canvasRef.current.width / rect.width;
      const scaleY = canvasRef.current.height / rect.height;
      const posX = Math.floor(x * scaleX);
      const posY = Math.floor(y * scaleY);
      try {
        const p = ctx.getImageData(posX, posY, 1, 1).data;
        const hexVal = "#" + [p[0], p[1], p[2]].map(val => val.toString(16).padStart(2, '0')).join('');
        setHex(hexVal.toUpperCase());
        setPoint({ x: (x / rect.width) * 100, y: (y / rect.height) * 100 });
      } catch (err) {
        console.error("Canvas pixel read error:", err);
      }
    }
  };

  useEffect(() => {
    if (photoUrl && canvasRef.current) {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        if (canvasRef.current) {
          canvasRef.current.width = img.width;
          canvasRef.current.height = img.height;
          const ctx = canvasRef.current.getContext('2d');
          if (ctx) { ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, img.width, img.height); ctx.drawImage(img, 0, 0); }
        }
      };
      img.onerror = () => {
        const imgNoCors = new Image();
        imgNoCors.onload = () => {
          if (canvasRef.current) {
            canvasRef.current.width = imgNoCors.width;
            canvasRef.current.height = imgNoCors.height;
            const ctx = canvasRef.current.getContext('2d');
            if (ctx) { ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, imgNoCors.width, imgNoCors.height); ctx.drawImage(imgNoCors, 0, 0); }
          }
        };
        imgNoCors.src = photoUrl;
      };
      img.src = photoUrl;
    }
  }, [photoUrl]);

  return (
    <div className="bg-white border border-[#FFB8CD]/50 rounded-2xl p-4 shadow-md mb-4 animate-in fade-in duration-150">
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2">
          <Droplet className="w-4 h-4 text-[#FF6B9E]" />
          <h4 className="font-bold text-[13px] text-black/80 uppercase tracking-wider">Eyedropper Color Sampler</h4>
        </div>
        <div className="flex items-center gap-2">
          {photoUrl && (
            <label className="text-[12px] font-bold text-[#FF6B9E] hover:underline cursor-pointer">
              Upload Different Image
              <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
            </label>
          )}
          <button type="button" onClick={onCancel} className="p-1 hover:bg-black/5 rounded-full"><X className="w-4 h-4" /></button>
        </div>
      </div>

      {!photoUrl ? (
        <label className="flex flex-col items-center justify-center h-36 border-2 border-dashed border-[#FFB8CD]/50 rounded-xl cursor-pointer hover:bg-[#FFF0F4]/30 transition-colors">
          <Upload className="w-6 h-6 text-[#FFB8CD] mb-2" />
          <span className="text-[14px] font-medium text-black/60">{isUploading ? 'Uploading...' : 'Upload Image to Sample Colors'}</span>
          <span className="text-[12px] text-black/40 mt-1">Or upload main character image first</span>
          <input type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={isUploading} />
        </label>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-[12px] text-black/60 font-medium">Click or tap anywhere on the image below to pick an exact pixel color:</p>
          <div 
            ref={containerRef}
            className="relative w-full rounded-xl overflow-hidden cursor-crosshair touch-none select-none border border-black/10 shadow-inner"
            onClick={handleInteract}
            onMouseDown={handleInteract}
            onMouseMove={(e) => { if (e.buttons === 1) handleInteract(e); }}
            onTouchStart={handleInteract}
            onTouchMove={handleInteract}
            style={{ maxHeight: '340px', display: 'flex', justifyContent: 'center', backgroundColor: '#f8f8f8' }}
          >
            <img ref={imageRef} src={photoUrl} alt="Eyedropper reference" className="max-h-[340px] object-contain pointer-events-none" />
            <canvas ref={canvasRef} className="hidden" />
            {point && (
              <div 
                className="absolute w-5 h-5 rounded-full border-2 border-white shadow-[0_0_0_1.5px_rgba(0,0,0,0.6)] pointer-events-none transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
                style={{ 
                  left: `${point.x}%`, 
                  top: `${point.y}%`,
                  backgroundColor: hex
                }}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-white/80" />
              </div>
            )}
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 items-end bg-[#FFF0F4]/50 p-3 rounded-xl border border-[#FFB8CD]/30">
            <div className="flex-1 w-full">
              <label className="block text-[11px] font-bold text-black/60 uppercase mb-1">Color Name (Optional)</label>
              <input 
                type="text" 
                value={name} 
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Ribbon Pink"
                className="w-full bg-white border border-[#FFB8CD]/50 rounded-lg px-3 py-2 text-[14px] focus:outline-none focus:border-[#FFB8CD]"
              />
            </div>
            <div className="flex-1 w-full">
              <label className="block text-[11px] font-bold text-black/60 uppercase mb-1">Selected HEX</label>
              <div className="flex gap-2 items-center">
                <div className="w-9 h-9 rounded-lg border border-black/10 shrink-0 shadow-sm" style={{ backgroundColor: hex }} />
                <input 
                  type="text" 
                  value={hex} 
                  onChange={e => setHex(e.target.value.toUpperCase())}
                  className="flex-1 bg-white border border-[#FFB8CD]/50 rounded-lg px-3 py-2 text-[14px] font-mono font-bold focus:outline-none focus:border-[#FFB8CD]"
                />
              </div>
            </div>
            <button 
              type="button" 
              onClick={() => onSave({ hex, name, photoUrl, photoStoragePath, point })}
              className="w-full sm:w-auto px-6 py-2.5 bg-[#FFB8CD] text-white font-bold rounded-lg shadow-sm hover:bg-[#FFB8CD]/90 flex items-center justify-center gap-2 shrink-0"
            >
              <Check className="w-4 h-4" /> Use Color
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
