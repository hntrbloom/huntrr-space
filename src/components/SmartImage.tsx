import React from 'react';
import { Image as ImageIcon, AlertCircle, RefreshCw } from 'lucide-react';
import { useImageCache } from '../hooks/useImageCache';
import { useAuth, setAccessToken } from '../lib/AuthContext';
import { useGoogleLogin } from '@react-oauth/google';

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
  className, 
  ...props 
}) => {
  const { displayUrl, isLoading, hasError, retry } = useImageCache(storagePath, src, driveFileId);
  const { signIn } = useAuth();
  
  const login = useGoogleLogin({
    onSuccess: (tokenResponse) => {
      setAccessToken(tokenResponse.access_token);
      retry();
    },
    scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly',
    prompt: 'consent'
  });

  if (isLoading) {
    return (
      <div className="w-full h-full bg-surface-variant/30 animate-pulse flex items-center justify-center p-2">
        <ImageIcon className="w-5 h-5 text-outline/30" />
      </div>
    );
  }

  if (hasError || !displayUrl) {
    if (fallbackIcon) return <>{fallbackIcon}</>;
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-surface-variant/30 text-outline p-2 text-center select-none">
        <AlertCircle className="w-5 h-5 text-outline/40 mb-1" />
        <span className="text-[9px] text-on-surface-variant/70 font-medium">Image unavailable</span>
        <button onClick={(e) => { e.stopPropagation(); retry(); }} className="mt-1 text-[9px] underline">Retry</button>
      </div>
    );
  }

  return (
    <img
      src={displayUrl}
      alt={alt || ''}
      className={className}
      onError={retry}
      {...props}
    />
  );
};


