import React, { useState, useEffect } from 'react';
import { useStore } from '@/store';
import { apiFetch } from '@/lib/api';
import { Settings, Moon, Sun, X } from 'lucide-react';

export function SettingsModal() {
  const [isOpen, setIsOpen] = useState(false);
  const chronotype = useStore(s => s.chronotype);
  const setChronotype = useStore(s => s.setChronotype);
  const [hasPrompted, setHasPrompted] = useState(false);

  // Automatically prompt on first load if chronotype is not set in local storage
  useEffect(() => {
    if (chronotype !== null && !hasPrompted) {
      const prompted = localStorage.getItem('fluxmind_prompted_chronotype');
      if (!prompted) {
        setIsOpen(true);
        localStorage.setItem('fluxmind_prompted_chronotype', 'true');
        setHasPrompted(true);
      }
    }
  }, [chronotype, hasPrompted]);

  const handleSelect = async (type: 'morning' | 'night') => {
    try {
      setChronotype(type);
      await apiFetch('/api/users/me/chronotype', {
        method: 'PUT',
        body: JSON.stringify({ chronotype: type })
      });
      // Force schedule refresh
      const res = await apiFetch('/api/schedule');
      useStore.getState().setCalendarBlocks(res.blocks);
      setIsOpen(false);
    } catch (err) {
      console.error('Failed to update chronotype', err);
    }
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 border border-white/10 transition-colors text-sm text-slate-300"
      >
        <Settings className="w-4 h-4" />
        Settings
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md overflow-hidden relative">
            <button 
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="p-6">
              <h2 className="text-xl font-bold text-white mb-2">Chronotype Profile</h2>
              <p className="text-slate-400 text-sm mb-6">
                Tell the AI when you are most productive. It will schedule your heavy, focus-intensive tasks during your peak hours.
              </p>

              <div className="flex flex-col gap-4">
                <button 
                  onClick={() => handleSelect('morning')}
                  className={`flex items-start gap-4 p-4 rounded-xl border transition-all text-left ${chronotype === 'morning' ? 'bg-amber-500/10 border-amber-500/50 ring-1 ring-amber-500' : 'bg-slate-800/50 border-white/5 hover:bg-slate-800'}`}
                >
                  <div className={`p-2 rounded-lg ${chronotype === 'morning' ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700 text-slate-400'}`}>
                    <Sun className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className={`font-semibold ${chronotype === 'morning' ? 'text-amber-400' : 'text-white'}`}>Morning Person</h3>
                    <p className="text-xs text-slate-400 mt-1">Peak energy from 7 AM to 11 AM. You prefer to tackle hard tasks early.</p>
                  </div>
                </button>

                <button 
                  onClick={() => handleSelect('night')}
                  className={`flex items-start gap-4 p-4 rounded-xl border transition-all text-left ${chronotype === 'night' ? 'bg-indigo-500/10 border-indigo-500/50 ring-1 ring-indigo-500' : 'bg-slate-800/50 border-white/5 hover:bg-slate-800'}`}
                >
                  <div className={`p-2 rounded-lg ${chronotype === 'night' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-slate-700 text-slate-400'}`}>
                    <Moon className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className={`font-semibold ${chronotype === 'night' ? 'text-indigo-400' : 'text-white'}`}>Night Owl</h3>
                    <p className="text-xs text-slate-400 mt-1">Peak energy from 6 PM to 3 AM. You focus best when the world is quiet.</p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
