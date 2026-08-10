import React, { useState, useEffect, useRef } from 'react';
import { X, Edit3, LayoutGrid, Clock, ChevronLeft, ChevronRight, Image as ImageIcon, Tag, Check } from 'lucide-react';
import { MiniFurniture, getGroupedPrintTime, isMiniCharmItem, getUniqueImages } from './MiniFurnitureView';
import { SmartImage } from './SmartImage';
import { ImageViewerModal } from './ImageViewerModal';

interface Props {
  setInfo: { id: string; name: string; coverImageUrl?: string; fullPrintTime?: string };
  items: MiniFurniture[];
  onClose: () => void;
  onSetCover: (url: string) => void;
  onRename: (newName: string) => void;
  onUpdateFullPrintTime: (newTime: string) => void;
  onDelete: (keepUngrouped: boolean) => void;
}

const HorizontalCarousel = ({ images, onImageClick, onSetCover }: { images: any[], onImageClick: (img: {url: string, storagePath?: string}) => void, onSetCover: (url: string) => void }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollPos, setScrollPos] = useState(0);
  const uniqueImages = getUniqueImages(images);

  const handleScroll = () => {
    if (scrollRef.current) {
      setScrollPos(scrollRef.current.scrollLeft);
    }
  };

  const scrollBy = (amount: number) => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

  if (uniqueImages.length === 0) {
    return <div className="text-center py-8 text-on-surface-variant text-sm border border-outline-variant/20 rounded-xl bg-surface-variant/10">No photos added yet.</div>;
  }

  return (
    <div className="relative group w-full min-w-0">
      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex overflow-x-auto gap-4 snap-x snap-mandatory scrollbar-hide pb-4 items-center"
        style={{ scrollBehavior: 'smooth', WebkitOverflowScrolling: 'touch' }}
      >
        {uniqueImages.map((img, idx) => (
          <div 
            key={idx} 
            className="snap-center shrink-0 w-[200px] sm:w-[250px] h-[200px] sm:h-[250px] relative rounded-xl overflow-hidden bg-surface-variant/30 cursor-pointer border border-outline-variant/20 group/img flex items-center justify-center"
            onClick={() => onImageClick({ url: img.url, storagePath: img.storagePath })}
          >
            <SmartImage src={img.url} storagePath={img.storagePath} className="w-full h-full object-contain" />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex flex-col items-center justify-center p-2">
               {img.type === 'design' && (<button onClick={(e) => { e.stopPropagation(); onSetCover(img.url); }} className="bg-white/90 text-on-surface text-[10px] font-bold px-3 py-1.5 rounded backdrop-blur-sm shadow-sm hover:bg-white transition-colors mb-2">Set as Cover</button>)}
            </div>
            <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] font-bold px-2 py-1 rounded backdrop-blur-sm">
               {idx + 1} of {images.length}
            </div>
          </div>
        ))}
      </div>
      <button 
        onClick={() => scrollBy(-300)}
        className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/90 text-on-surface p-2 rounded-full shadow-md hover:bg-white opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-0 hidden md:block"
        disabled={scrollPos <= 0}
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button 
        onClick={() => scrollBy(300)}
        className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/90 text-on-surface p-2 rounded-full shadow-md hover:bg-white opacity-0 group-hover:opacity-100 transition-opacity hidden md:block"
      >
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
};

export const SetGalleryModal = ({ 
  setInfo, 
  items, 
  onClose, 
  onSetCover, 
  onRename, 
  onUpdateFullPrintTime,
  onDelete 
}: Props) => {
  const [viewingImage, setViewingImage] = useState<{url: string, storagePath?: string} | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState(setInfo.name);

  const [isEditingPrintTime, setIsEditingPrintTime] = useState(false);
  const [customPrintTime, setCustomPrintTime] = useState(setInfo.fullPrintTime || '');

  const printTimeInfo = getGroupedPrintTime(items, setInfo.fullPrintTime);

  useEffect(() => {
    setCustomPrintTime(setInfo.fullPrintTime || '');
  }, [setInfo.fullPrintTime]);

  useEffect(() => {
    // Lock body scroll
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (viewingImage) {
           setViewingImage(null);
        } else {
           onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    
    // Add history state for back button handling
    window.history.pushState({ modal: 'set-gallery' }, '');
    const handlePopState = () => {
       if (viewingImage) {
           setViewingImage(null);
           window.history.pushState({ modal: 'set-gallery' }, ''); // restore state for the modal
       } else {
           onClose();
       }
    };
    window.addEventListener('popstate', handlePopState);

    return () => {
      document.body.style.overflow = originalStyle;
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('popstate', handlePopState);
      // Remove history state if we unmount
      if (window.history.state && window.history.state.modal === 'set-gallery') {
         window.history.back();
      }
    };
  }, [onClose, viewingImage]);

  return (
    <div 
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 transition-opacity" 
      onClick={() => onClose()}
    >
      <div 
        className="bg-surface-container-lowest w-full max-w-4xl h-[90dvh] max-h-[90dvh] rounded-t-[32px] sm:rounded-[32px] shadow-2xl flex flex-col overflow-hidden relative overscroll-none"
        onClick={e => e.stopPropagation()}
        style={{
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div className="px-4 py-4 sm:px-6 sm:py-5 border-b border-outline-variant/30 flex items-center justify-between shrink-0 bg-white sticky top-0 z-10 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0 mr-4">
            {isEditing ? (
              <div className="flex items-center gap-2 w-full max-w-sm">
                <input 
                  type="text" 
                  value={newName} 
                  onChange={e => setNewName(e.target.value)}
                  className="w-full px-3 py-1.5 border border-outline-variant rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-bold text-lg sm:text-xl min-w-0"
                  autoFocus
                />
                <button onClick={() => { onRename(newName); setIsEditing(false); }} className="px-3 py-1.5 bg-primary text-white rounded-lg text-sm font-bold shrink-0">Save</button>
                <button onClick={() => { setIsEditing(false); setNewName(setInfo.name); }} className="px-3 py-1.5 text-on-surface-variant text-sm font-bold hover:bg-surface-variant/20 rounded-lg shrink-0">Cancel</button>
              </div>
            ) : (
              <div className="flex items-center gap-3 min-w-0">
                <h2 className="text-xl sm:text-2xl font-bold text-on-surface flex items-center gap-2 truncate">
                  <LayoutGrid className="w-5 h-5 sm:w-6 sm:h-6 text-primary shrink-0" /> 
                  <span className="truncate">{setInfo.name}</span>
                </h2>
                <button onClick={() => setIsEditing(true)} className="p-2 text-on-surface-variant hover:text-primary hover:bg-primary/10 rounded-full transition-colors shrink-0">
                  <Edit3 className="w-4 h-4" />
                </button>
                <span className="hidden sm:inline-block bg-surface-variant/20 text-on-surface-variant px-3 py-1 rounded-full text-sm font-bold ml-2 shrink-0">
                  {items.length} Designs
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
             <button onClick={onClose} className="p-2 text-on-surface-variant hover:bg-surface-variant/20 rounded-full transition-colors bg-surface-variant/10 sm:bg-transparent">
               <X className="w-6 h-6" />
             </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-surface-container-lowest">
          <div className="max-w-4xl mx-auto space-y-6 pb-12">
            
            <div className="flex flex-wrap gap-2 sm:hidden">
                <span className="bg-surface-variant/20 text-on-surface-variant px-3 py-1 rounded-full text-sm font-bold">
                  {items.length} Designs
                </span>
            </div>

            {/* Full Print Time banner card */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-outline-variant/20 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#FFF0F4] flex items-center justify-center shrink-0 border border-[#FF85A2]/20">
                  <Clock className="w-5 h-5 text-[#7D6190]" />
                </div>
                <div>
                  <div className="text-xs font-bold text-on-surface-variant/70 uppercase tracking-wider flex items-center gap-1.5">
                    <span>Group Full Print Time</span>
                    {printTimeInfo.isCustom && (
                      <span className="text-[10px] bg-[#FFF0F4] text-[#7D6190] px-2 py-0.5 rounded-full font-bold border border-[#FF85A2]/30 lowercase">custom override</span>
                    )}
                  </div>
                  <div className="text-xl sm:text-2xl font-bold text-on-surface flex items-baseline gap-2 mt-0.5">
                    <span>{printTimeInfo.displayTime}</span>
                    {printTimeInfo.isCustom && printTimeInfo.calculatedTime && (
                      <span className="text-xs font-medium text-on-surface-variant/70">
                        (Sum of items: {printTimeInfo.calculatedTime})
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {!isEditingPrintTime ? (
                <button
                  type="button"
                  onClick={() => {
                    setCustomPrintTime(setInfo.fullPrintTime || printTimeInfo.calculatedTime || '');
                    setIsEditingPrintTime(true);
                  }}
                  className="self-start md:self-center px-4 py-2 bg-[#FFF0F4] hover:bg-[#FF85A2] text-[#7D6190] hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-xs border border-outline-variant/20"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>{setInfo.fullPrintTime ? 'Edit Full Print Time' : 'Set Custom Print Time'}</span>
                </button>
              ) : (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-surface-variant/10 p-2.5 rounded-xl border border-outline-variant/30 w-full md:w-auto">
                  <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-outline-variant focus-within:ring-2 focus-within:ring-primary flex-1">
                    <Clock className="w-4 h-4 text-primary shrink-0" />
                    <input
                      type="text"
                      value={customPrintTime}
                      onChange={e => setCustomPrintTime(e.target.value)}
                      placeholder="e.g. 5h 30m"
                      className="w-full text-sm font-bold text-on-surface bg-transparent focus:outline-none"
                      autoFocus
                    />
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {printTimeInfo.calculatedTime && (
                      <button
                        type="button"
                        onClick={() => setCustomPrintTime(printTimeInfo.calculatedTime)}
                        className="px-2.5 py-1.5 bg-white border border-outline-variant/30 hover:bg-surface-variant/20 text-on-surface text-xs font-bold rounded-lg transition-colors"
                        title={`Use calculated sum of items (${printTimeInfo.calculatedTime})`}
                      >
                        Sum ({printTimeInfo.calculatedTime})
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateFullPrintTime(customPrintTime.trim());
                        setIsEditingPrintTime(false);
                      }}
                      className="px-3 py-1.5 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary/90 transition-colors shadow-2xs"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingPrintTime(false);
                        setCustomPrintTime(setInfo.fullPrintTime || '');
                      }}
                      className="px-2.5 py-1.5 text-xs font-bold text-on-surface-variant hover:bg-surface-variant/30 rounded-lg"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {items.map(item => {
              const isMini = isMiniCharmItem(item);
              const uniqueImgs = getUniqueImages(item.images);
              const displayedImages = isMini
                ? (uniqueImgs.length > 0 ? [uniqueImgs.find(img => img.type === 'finished') || uniqueImgs[0]] : [])
                : uniqueImgs;

              return (
                <div key={item.id} className="bg-white rounded-2xl shadow-sm border border-outline-variant/30 overflow-hidden flex flex-col">
                  <div className="p-4 sm:p-5 border-b border-outline-variant/20 bg-surface-variant/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-lg sm:text-xl text-on-surface truncate" title={item.name}>{item.name}</h3>
                      <div className="text-sm text-on-surface-variant mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                        <span className="flex items-center gap-1.5"><Tag className="w-4 h-4 text-primary/70"/> {item.status}</span>
                        {item.printTime && (
                          <span className="flex items-center gap-1.5 font-medium text-[#7D6190]">
                            <Clock className="w-4 h-4 text-[#FF85A2]"/> Item Print Time: {item.printTime}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="p-4 sm:p-5">
                     <HorizontalCarousel images={displayedImages} onImageClick={setViewingImage} onSetCover={onSetCover} />
                  </div>
                </div>
              );
            })}
            
            {items.length === 0 && (
               <div className="text-center py-12 text-on-surface-variant w-full">No designs found in this set.</div>
            )}

            <div className="pt-8 mt-8 border-t border-outline-variant/20 flex flex-col sm:flex-row items-center gap-4 justify-center">
                <button onClick={() => {
                    if(confirm('Remove this set but keep all designs ungrouped?')) {
                    onDelete(true);
                    }
                }} className="w-full sm:w-auto px-5 py-2.5 bg-surface-variant/20 text-on-surface hover:bg-surface-variant/40 rounded-xl text-sm font-bold transition-colors">
                Ungroup All
                </button>
                <button onClick={() => {
                    if(confirm('Delete this set and its designs?')) {
                    onDelete(false);
                    }
                }} className="w-full sm:w-auto px-5 py-2.5 bg-error/10 text-error hover:bg-error/20 rounded-xl text-sm font-bold transition-colors">
                Delete Set & Designs
                </button>
            </div>
          </div>
        </div>
        
        <div className="sm:hidden p-4 bg-white border-t border-outline-variant/20 pb-[max(1rem,env(safe-area-inset-bottom))]">
             <button onClick={onClose} className="w-full py-3 bg-primary text-white rounded-xl font-bold text-base shadow-sm">
                 Back to Prints
             </button>
        </div>
      </div>

      {viewingImage && (
        <ImageViewerModal
          image={{
            url: viewingImage.url,
            storagePath: viewingImage.storagePath,
            title: `${setInfo.name} Set Photo`,
            filename: `${setInfo.name}_set_photo`,
          }}
          onClose={() => setViewingImage(null)}
        />
      )}
    </div>
  );
};
