import React, { useState, useEffect } from 'react';
import { Image as ImageIcon, AlertCircle, RefreshCw, LogIn } from 'lucide-react';
import { useImageCache } from '../hooks/useImageCache';
import { requestFreshDriveToken } from '../lib/driveAuth';

interface SmartImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string;
  storagePath?: string;
  driveFileId?: string;
  isThumbnail?: boolean;
  fallbackIcon?: React.ReactNode;
}

export const SmartImage: React.FC<SmartImageProps> = ({ 
  src, 
  storagePath, 
  driveFileId,
  isThumbnail = true,
  fallbackIcon, 
  alt, 
  className = '', 
  ...props 
}) => {
  const { displayUrl, isLoading, hasError, errorMessage, retry } = useImageCache(storagePath, src, driveFileId);
  const [retried, setRetried] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  useEffect(() => {
    setRetried(false);
  }, [src, storagePath, driveFileId]);

  const handleError = () => {
    if (!retried) {
      setRetried(true);
      retry();
    }
  };

  const handleReconnect = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsReconnecting(true);
    try {
      const newToken = await requestFreshDriveToken(true);
      if (newToken) {
        await retry();
      }
    } catch (err) {
      console.error('[SmartImage] Reconnect failed:', err);
    } finally {
      setIsReconnecting(false);
    }
  };

  if (isLoading && !displayUrl) {
    return (
      <div className="w-full h-full bg-[#F5F0EB] animate-pulse flex items-center justify-center p-2 select-none">
        <ImageIcon className="w-5 h-5 text-[#B0A59B]/50" />
      </div>
    );
  }

  const isAuthError = errorMessage?.includes('401') || errorMessage?.includes('403') || errorMessage?.includes('re-authorize') || errorMessage?.includes('expired');

  if ((hasError && retried) || (!displayUrl && !isLoading)) {
    if (fallbackIcon) return <>{fallbackIcon}</>;
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#F5F0EB] text-[#7D7065] p-2 text-center select-none">
        <AlertCircle className="w-5 h-5 text-[#B0A59B] mb-1" />
        <span className="text-[10px] font-semibold text-[#6E6258] mb-1">
          {isAuthError ? 'Drive Auth Needed' : 'Photo load failed'}
        </span>
        {isAuthError ? (
          <button 
            type="button"
            onClick={handleReconnect}
            disabled={isReconnecting}
            className="flex items-center gap-1 text-[10px] font-bold bg-[#FF6B9E] text-white hover:bg-[#FF6B9E]/90 px-2.5 py-1 rounded-md shadow-sm transition-colors disabled:opacity-50"
          >
            <LogIn className="w-3 h-3" /> {isReconnecting ? 'Connecting...' : 'Reconnect Google Drive'}
          </button>
        ) : (
          <button 
            type="button"
            onClick={(e) => { e.stopPropagation(); retry(); }} 
            className="flex items-center gap-1 text-[10px] font-bold bg-white/80 hover:bg-white text-[#5C5046] px-2.5 py-1 rounded-md shadow-sm border border-[#E0D5CB] transition-colors"
          >
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <img
      src={displayUrl || src}
      alt={alt || ''}
      className={className}
      onError={handleError}
      {...props}
    />
  );
};
