import { safeGetDoc as getDoc, safeGetDocs as getDocs, safeGetDoc } from '../lib/firebase';
import React, { useState, useEffect } from 'react';
import { PaintBucket, Search, X } from 'lucide-react';
import { db } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { useAuth } from '../lib/AuthContext';

interface TopBarProps {
  title?: string;
  showSearch?: boolean;
}

export function TopBar({ title = "My Planner", showSearch = false }: TopBarProps) {
  const { user } = useAuth();
  const [isBgModalOpen, setIsBgModalOpen] = useState(false);
  const [hexColor, setHexColor] = useState('#FFF0F4');
  const [pickerColor, setPickerColor] = useState('#FFF0F4');
  const [hexError, setHexError] = useState('');

  useEffect(() => {
    if (user && isBgModalOpen) {
      // Load current preference
      safeGetDoc(doc(db, `users/${user.uid}/preferences`, 'global')).then(snap => {
        if (snap.exists() && snap.data().backgroundColor) {
          const bg = snap.data().backgroundColor;
          setHexColor(bg);
          setPickerColor(bg);
        } else {
          setHexColor('#FFF0F4');
          setPickerColor('#FFF0F4');
        }
      });
    }
  }, [user, isBgModalOpen]);

  const validateHex = (hex: string) => {
    return /^#?([0-9A-Fa-f]{6})$/.test(hex);
  };

  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setHexColor(val);
    setHexError('');
    if (validateHex(val)) {
      setPickerColor(val.startsWith('#') ? val : `#${val}`);
    }
  };

  const handlePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPickerColor(val);
    setHexColor(val);
    setHexError('');
  };

  const applyColor = async () => {
    if (!validateHex(hexColor)) {
      setHexError('Invalid HEX code');
      return;
    }
    const finalHex = hexColor.startsWith('#') ? hexColor : `#${hexColor}`;
    document.body.style.backgroundColor = finalHex;
    if (user) {
      await setDoc(doc(db, `users/${user.uid}/preferences`, 'global'), { backgroundColor: finalHex }, { merge: true });
    }
    setIsBgModalOpen(false);
  };

  const resetColor = async () => {
    setHexColor('#FFF0F4');
    setPickerColor('#FFF0F4');
    setHexError('');
    document.body.style.backgroundColor = '#FFF0F4';
    if (user) {
      await setDoc(doc(db, `users/${user.uid}/preferences`, 'global'), { backgroundColor: '#FFF0F4' }, { merge: true });
    }
    setIsBgModalOpen(false);
  };

  return (
    <>
      <header className="flex justify-between items-center w-full px-margin-mobile md:px-margin-desktop py-4 h-rule-height min-h-[72px] bg-surface md:bg-transparent z-30 shrink-0 sticky top-0">
        <div className="md:hidden">
          <h1 className="text-[22px] leading-[1.4] font-semibold font-headline-sm text-primary">{title}</h1>
        </div>
        <div className="hidden md:block"></div>
        
        <div className="flex items-center gap-2">

          <button 
            onClick={() => setIsBgModalOpen(true)}
            aria-label="Customize background"
            className="w-10 h-10 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            <PaintBucket className="w-5 h-5" />
          </button>
        </div>
      </header>

      {isBgModalOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsBgModalOpen(false);
          }}
        >
          <div className="bg-surface rounded-2xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-[20px] font-headline-sm font-semibold text-on-surface">Background Color</h3>
              <button 
                onClick={() => setIsBgModalOpen(false)}
                className="p-2 -mr-2 rounded-full text-on-surface-variant hover:bg-surface-variant transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex flex-col items-center gap-6">
              {/* Preview Circle */}
              <div 
                className="w-24 h-24 rounded-full border-4 border-surface shadow-md"
                style={{ backgroundColor: pickerColor }}
              />

              <div className="flex items-center gap-4 w-full justify-center">
                <input 
                  type="color" 
                  value={pickerColor}
                  onChange={handlePickerChange}
                  className="w-12 h-12 rounded-lg cursor-pointer border-0 p-0"
                />
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="text-on-surface-variant font-medium">#</span>
                    <input 
                      type="text" 
                      value={hexColor.replace('#', '')}
                      onChange={handleHexChange}
                      placeholder="FFF0F4"
                      className="w-24 bg-surface-variant/50 border border-outline-variant/50 rounded-lg px-3 py-1.5 text-on-surface outline-none focus:border-primary font-mono"
                      maxLength={6}
                    />
                  </div>
                  {hexError && <span className="text-[12px] text-error mt-1">{hexError}</span>}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 mt-8">
              <button 
                onClick={applyColor}
                className="w-full py-2.5 bg-primary text-on-primary rounded-xl font-semibold hover:bg-primary/90 transition-colors"
              >
                Apply
              </button>
              <button 
                onClick={resetColor}
                className="w-full py-2.5 bg-surface-variant text-on-surface-variant rounded-xl font-semibold hover:bg-surface-variant/80 transition-colors"
              >
                Reset to Default
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
