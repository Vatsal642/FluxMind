"use client";
import React, { useEffect, useState } from 'react';
import { useStore } from '@/store';
import { apiFetch } from '@/lib/api';
import { Timer, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';

export function MicroFocusHUD() {
  const task = useStore(s=>s.activeTask);
  const setActiveTask = useStore(s=>s.setActiveTask);
  const updateTaskStatus = useStore(s=>s.updateTaskStatus);
  const [secs, setSecs] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { if(task) setSecs(task.estimated_minutes*60); }, [task]);
  useEffect(() => {
    if(!task) return;
    const id = setInterval(()=>setSecs(p=>p-1), 1000);
    return ()=>clearInterval(id);
  }, [task]);

  const complete = async () => {
    try { 
      await apiFetch(`/api/tasks/${task!.task_id}/complete`,{method:'POST'}); 
      updateTaskStatus(task!.task_id, 'COMPLETED');
    } catch{}
    setActiveTask(null);
  };

  const over = secs < 0;
  const abs  = Math.abs(secs);
  const mm   = String(Math.floor(abs/60)).padStart(2,'0');
  const ss   = String(abs%60).padStart(2,'0');
  const pct  = task ? Math.min(100, Math.max(0, ((task.estimated_minutes*60-secs)/(task.estimated_minutes*60))*100)) : 0;

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {task && (
        <motion.div 
          key="hud-overlay"
          initial={{opacity:0}} 
          animate={{opacity:1}} 
          exit={{opacity:0}} 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        >
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/80 backdrop-blur-md" 
            onClick={()=>setActiveTask(null)} 
          />
          
          {/* Modal */}
          <motion.div 
            initial={{opacity:0, scale:0.9, y:20}} 
            animate={{opacity:1, scale:1, y:0}} 
            exit={{opacity:0, scale:0.9, y:20}} 
            className="premium-card relative z-10 w-full max-w-[380px] p-8 text-center shadow-2xl"
          >
            
            <div className="flex items-center justify-center gap-2 text-[11px] font-bold tracking-widest uppercase text-indigo-400 mb-3">
              <Timer className="w-4 h-4" /> Focus Mode
            </div>
            
            <h2 className="text-[18px] font-bold text-white mb-8 leading-tight font-['Space_Grotesk']">{task.title}</h2>

            <div className={`text-[72px] font-bold font-['Fira_Code'] tracking-tighter mb-8 leading-none ${over ? 'text-amber-500' : 'text-white'}`}>
              {over && <span className="text-[40px] align-top inline-block mt-2 mr-1">+</span>}
              {mm}:{ss}
            </div>

            <div className="w-full max-w-[240px] mx-auto h-1.5 rounded-full bg-slate-700/50 overflow-hidden mb-8">
              <div className="h-full rounded-full transition-all duration-1000 ease-linear" style={{ 
                width:`${pct}%`, 
                background: over ? 'linear-gradient(90deg, #f59e0b, #ef4444)' : 'linear-gradient(90deg, #4f46e5, #0ea5e9)' 
              }} />
            </div>

            <button onClick={complete} className="btn-primary w-full py-3.5 text-[15px]">
              <Check className="w-5 h-5" /> Mark Task Complete
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
