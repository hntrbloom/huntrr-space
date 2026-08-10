import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Edit2, Trash2, Check, X, Settings } from 'lucide-react';
import { WikiEntity } from './CharacterWikiView';

interface EntitySelectorProps {
  label: string;
  entities: WikiEntity[];
  valueId: string | undefined;
  fallbackName: string;
  onChange: (id: string, name: string) => void;
  onCreate: (name: string) => Promise<string | null>;
  onRename: (id: string, newName: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  placeholder?: string;
  inUseIds: string[];
}

export function EntitySelector({
  label, entities, valueId, fallbackName, onChange, onCreate, onRename, onDelete, placeholder, inUseIds
}: EntitySelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isManaging, setIsManaging] = useState(false);
  
  // Input search & create state
  const selectedEntity = valueId ? entities.find(e => e.id === valueId) : undefined;
  const initialText = selectedEntity ? selectedEntity.name : (fallbackName || '');
  const [inputValue, setInputValue] = useState(initialText);

  // Sync input value when selected entity or fallbackName changes externally
  useEffect(() => {
    const matched = valueId ? entities.find(e => e.id === valueId) : undefined;
    setInputValue(matched ? matched.name : (fallbackName || ''));
  }, [valueId, fallbackName, entities]);

  // Edit mode in manage view
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement;
      if (target && target.closest && target.closest('.entity-selector-dropdown')) {
        return;
      }
      if (wrapperRef.current && !wrapperRef.current.contains(target as Node)) {
        setIsOpen(false);
        setIsManaging(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (isOpen && wrapperRef.current) {
      const updatePosition = () => {
        if (wrapperRef.current) {
          const rect = wrapperRef.current.getBoundingClientRect();
          const viewportHeight = window.innerHeight;
          const viewportWidth = window.innerWidth;

          const spaceBelow = viewportHeight - rect.bottom - 12;
          const spaceAbove = rect.top - 12;
          const showAbove = spaceBelow < 180 && spaceAbove > spaceBelow;

          const maxHeight = Math.max(120, Math.min(260, showAbove ? spaceAbove : spaceBelow));

          let left = rect.left;
          let width = rect.width;
          if (left < 8) {
            left = 8;
            width = Math.min(width, viewportWidth - 16);
          } else if (left + width > viewportWidth - 8) {
            left = Math.max(8, viewportWidth - width - 8);
            width = Math.min(width, viewportWidth - 16);
          }

          setDropdownStyle({
            position: 'fixed',
            top: showAbove ? undefined : rect.bottom + 4,
            bottom: showAbove ? viewportHeight - rect.top + 4 : undefined,
            left: left,
            width: width,
            maxHeight: `${maxHeight}px`,
            zIndex: 99999
          });
        }
      };
      updatePosition();

      const handleScroll = (e: Event) => {
        // If scrolling inside the dropdown itself, don't update position/close
        const target = e.target as HTMLElement;
        if (target && target.closest && target.closest('.entity-selector-dropdown')) {
          return;
        }
        updatePosition();
      };

      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', handleScroll, true);

      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', handleScroll, true);
      };
    }
  }, [isOpen]);

  const trimmedInput = (inputValue || '').trim();
  const lowerInput = trimmedInput.toLowerCase();

  // Filter matching suggestions case-insensitively
  const matchingEntities = (entities || []).filter(e => e && e.name && e.name.toLowerCase().includes(lowerInput));
  
  // Check exact match case-insensitively to prevent duplicates like "Sanrio" and "sanrio"
  const exactMatch = (entities || []).find(e => e && e.name && e.name.toLowerCase() === lowerInput);

  const handleSelect = (entity: WikiEntity) => {
    setInputValue(entity.name);
    onChange(entity.id, entity.name);
    setIsOpen(false);
  };

  const handleCreateNew = async (nameToCreate?: string) => {
    const targetName = (nameToCreate || inputValue).trim();
    if (!targetName) return;

    // Prevent duplicate case-insensitively
    const existing = entities.find(e => e.name.toLowerCase() === targetName.toLowerCase());
    if (existing) {
      handleSelect(existing);
      return;
    }

    const newId = await onCreate(targetName);
    if (newId) {
      setInputValue(targetName);
      onChange(newId, targetName);
      setIsOpen(false);
      setIsManaging(false);
    }
  };

  const handleClear = () => {
    setInputValue('');
    onChange('', '');
    setIsOpen(false);
  };

  const handleRename = async (id: string) => {
    const trimmed = editName.trim();
    if (!trimmed) return;
    const existing = entities.find(e => e.id !== id && e.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      alert('This name already exists.');
      return;
    }
    const success = await onRename(id, trimmed);
    if (success) {
      setEditingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    const isInUse = (inUseIds || []).includes(id);
    if (isInUse) {
      const confirm = window.confirm(`This ${label} is currently assigned to one or more characters. Are you sure you want to delete it?`);
      if (!confirm) return;
    }
    const success = await onDelete(id);
    if (success && valueId === id) {
      handleClear();
    }
  };

  return (
    <div ref={wrapperRef} className="relative w-full box-border max-w-full">
      <div className="flex justify-between items-center mb-1.5 gap-2">
        <label className="block text-[12px] font-bold text-black/60 uppercase tracking-wider whitespace-normal leading-tight">{label}</label>
        {entities.length > 0 && !isManaging && (
          <button
            type="button"
            onClick={() => { setIsManaging(!isManaging); setIsOpen(true); }}
            className="text-[11px] font-bold text-black/40 hover:text-black flex items-center gap-1 transition-colors shrink-0"
            title={`Manage ${label} list`}
          >
            <Settings className="w-3.5 h-3.5" /> Manage
          </button>
        )}
      </div>

      <div className="relative">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setIsOpen(true);
            setIsManaging(false);
            // Also notify parent of text change fallback
            const matched = entities.find(ent => ent.name.toLowerCase() === e.target.value.trim().toLowerCase());
            if (matched) {
              onChange(matched.id, matched.name);
            } else {
              onChange('', e.target.value);
            }
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder || `Type or select a ${label}...`}
          className="w-full bg-white border border-[#FFB8CD]/50 rounded-lg px-3 py-2.5 pr-10 text-black focus:outline-none focus:border-[#FFB8CD] shadow-sm font-medium text-[14px] box-border max-w-full"
        />

        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 z-10">
          {inputValue && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 text-black/40 hover:text-black rounded-full hover:bg-black/5"
              title="Clear"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => { setIsOpen(!isOpen); setIsManaging(false); }}
            className="p-1 text-black/40 hover:text-black"
          >
            <span className="text-[10px]">▼</span>
          </button>
        </div>
      </div>

      {isOpen && createPortal(
        <div style={dropdownStyle} className="entity-selector-dropdown bg-white border border-[#FFB8CD]/50 rounded-xl shadow-2xl flex flex-col overflow-hidden max-h-64 sm:max-h-72">
          {!isManaging ? (
            <>
              <div className="flex-1 overflow-y-auto">
                {/* Search matching options */}
                {matchingEntities.map(e => (
                  <div
                    key={e.id}
                    onMouseDown={(ev) => {
                      ev.preventDefault();
                      handleSelect(e);
                    }}
                    onTouchEnd={(ev) => {
                      ev.preventDefault();
                      handleSelect(e);
                    }}
                    onClick={() => handleSelect(e)}
                    className={`px-4 py-3 hover:bg-[#FFF0F4] cursor-pointer text-[14px] font-medium transition-colors border-b border-black/5 last:border-0 flex items-center justify-between ${valueId === e.id ? 'bg-[#FFF0F4] text-[#FFB8CD] font-bold' : 'text-black'}`}
                  >
                    <span>{e.name}</span>
                    {valueId === e.id && <Check className="w-4 h-4 text-[#FFB8CD]" />}
                  </div>
                ))}

                {matchingEntities.length === 0 && entities.length > 0 && (
                  <div className="px-4 py-3 text-[13px] text-black/40 italic">No matching saved {label.toLowerCase()}s</div>
                )}

                {entities.length === 0 && (
                  <div className="px-4 py-3 text-[13px] text-black/40 italic">No {label.toLowerCase()}s saved yet</div>
                )}
              </div>

              {/* Add New Option button if typed value isn't an exact match */}
              {trimmedInput && !exactMatch && (
                <div className="border-t border-[#FFB8CD]/40 p-2 bg-[#FFF0F4]/60">
                  <button
                    type="button"
                    onMouseDown={(ev) => {
                      ev.preventDefault();
                      handleCreateNew();
                    }}
                    onClick={() => handleCreateNew()}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 text-[13px] font-bold text-white bg-[#FFB8CD] hover:bg-[#FFB8CD]/90 rounded-lg shadow-sm transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Save "{trimmedInput}" as new {label}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col h-full max-h-64 sm:max-h-72">
              <div className="flex justify-between items-center p-3 border-b border-[#FFB8CD]/30 bg-[#FFF0F4]">
                <span className="font-bold text-[13px] uppercase tracking-wider text-black/60">Manage {label}s</span>
                <button type="button" onClick={() => setIsManaging(false)} className="text-black/40 hover:text-black p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
                {entities.map(e => (
                  <div key={e.id} className="flex items-center justify-between p-2 hover:bg-black/5 rounded-lg group">
                    {editingId === e.id ? (
                      <div className="flex-1 flex gap-2 items-center">
                        <input
                          type="text"
                          autoFocus
                          value={editName}
                          onChange={ev => setEditName(ev.target.value)}
                          onKeyDown={ev => ev.key === 'Enter' && handleRename(e.id)}
                          className="flex-1 bg-white border border-[#FFB8CD] rounded px-2 py-1 text-[13px] outline-none"
                        />
                        <button type="button" onClick={() => handleRename(e.id)} className="text-green-500 p-1"><Check className="w-4 h-4" /></button>
                        <button type="button" onClick={() => setEditingId(null)} className="text-black/40 p-1"><X className="w-4 h-4" /></button>
                      </div>
                    ) : (
                      <>
                        <span className="text-[13px] font-medium text-black">{e.name}</span>
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => { setEditingId(e.id); setEditName(e.name); }} className="p-1.5 text-black/40 hover:text-black rounded bg-white shadow-sm"><Edit2 className="w-3 h-3" /></button>
                          <button type="button" onClick={() => handleDelete(e.id)} className="p-1.5 text-red-400 hover:text-red-600 rounded bg-white shadow-sm"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
