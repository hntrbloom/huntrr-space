import React, { useState, DragEvent, useRef } from 'react';

interface ImageUploaderAreaProps {
  key?: React.Key;
  onUpload: (files: FileList | File[]) => void;
  className?: string;
  children: React.ReactNode;
}

export function ImageUploaderArea({ onUpload, className = '', children }: ImageUploaderAreaProps) {
  const [dragCounter, setDragCounter] = useState(0);
  const isDragging = dragCounter > 0;

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter(prev => prev + 1);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter(prev => Math.max(0, prev - 1));
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter(0);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onUpload(e.dataTransfer.files);
    }
  };

  return (
    <div 
      className={`relative transition-all ${className}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-primary/20 rounded-xl backdrop-blur-[2px] border-2 border-dashed border-primary pointer-events-none">
          <span className="text-primary font-bold text-lg pointer-events-none bg-surface/90 px-6 py-3 rounded-xl shadow-md border border-primary/20">Drop images here</span>
        </div>
      )}
      {children}
    </div>
  );
}
