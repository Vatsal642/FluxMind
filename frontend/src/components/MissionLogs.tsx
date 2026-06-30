"use client";
import React, { useState } from 'react';
import { useStore } from '@/store';
import { Bot, ChevronLeft, ChevronRight, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function MissionLogs() {
  const [open, setOpen] = useState(false);
  const logs = useStore(s=>s.missionLogs);
  const unread = useStore(s=>s.unreadLogCount);
  const resetUnread = useStore(s=>s.resetUnreadLogCount);

  const toggle = () => { if(!open) resetUnread(); setOpen(v=>!v); };

  const rel = (iso: string) => {
    const m = Math.floor((Date.now()-new Date(iso).getTime())/60000);
    if(m<1) return 'now'; if(m<60) return `${m}m`;
    const h=Math.floor(m/60); if(h<24) return `${h}h`;
    return `${Math.floor(h/24)}d`;
  };

  return (
    <>
      <button onClick={toggle} className="fixed top-1/2 -translate-y-1/2 z-[75] bg-white/5 border border-white/10 border-r-0 rounded-l-xl p-3 flex flex-col items-center gap-2 text-white/60 hover:text-white transition-all shadow-[-4px_0_12px_rgba(0,0,0,0.3)]" style={{ right: open ? 340 : 0, transition: 'right 0.3s cubic-bezier(0.4,0,0.2,1)' }}>
        <div className="relative">
          <Bot className="w-5 h-5" />
          {!open && unread > 0 && (
            <div className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-indigo-600 rounded-full border-2 border-white/10 flex items-center justify-center text-[8px] font-bold text-white">
              {unread}
            </div>
          )}
        </div>
        {open ? <ChevronRight className="w-4 h-4 mt-1 opacity-50" /> : <ChevronLeft className="w-4 h-4 mt-1 opacity-50" />}
      </button>

      <div className="fixed top-0 bottom-0 right-0 w-[340px] z-[70] bg-black/40/95 backdrop-blur-xl border-l border-white/10 flex flex-col shadow-xl transition-transform duration-300 ease-out" style={{ transform: open ? 'translateX(0)' : 'translateX(100%)' }}>
        <div className="p-5 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/60">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-white">Mission Logs</h2>
              <p className="text-[12px] text-white/60">AI decision trail & history</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
          {logs.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 opacity-60">
              <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                <Activity className="w-7 h-7 text-white0" />
              </div>
              <p className="text-[13px] text-white/60 text-center leading-relaxed">
                No logs yet.<br />AI activity will appear here.
              </p>
            </div>
          ) : (
            logs.map(l => (
              <div key={l.log_id} className="bg-white/5 border border-white/10 rounded-xl p-4 shadow-sm">
                <div className="flex justify-between items-center mb-2">
                  <span className="badge badge-primary text-[9px]">{l.action_taken.split(' ').slice(0,3).join(' ')}</span>
                  <span className="text-[10px] text-white/60 font-['Fira_Code']">{rel(l.created_at)}</span>
                </div>
                <p className="text-[13px] font-semibold text-white mb-1 leading-tight">{l.action_taken}</p>
                <p className="text-[12px] text-white/60 leading-relaxed">{l.reasoning}</p>
              </div>
            ))
          )}
        </div>
      </div>

      <AnimatePresence>
        {open && <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={toggle} className="fixed inset-0 z-[65] bg-black/60 backdrop-blur-sm" />}
      </AnimatePresence>
    </>
  );
}
