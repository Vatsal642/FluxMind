"use client";
import React, { useState } from 'react';
import { useStore } from '@/store';
import { apiFetch } from '@/lib/api';
import { Target, Plus, X, ArrowUpRight, ArrowRight, ArrowDownRight, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function HabitsPanel() {
  const habits = useStore(s => s.habits);
  const updateHabit = useStore(s => s.updateHabit);
  const removeHabit = useStore(s => s.removeHabit);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [deadline, setDeadline] = useState('');
  const [loading, setLoading] = useState(false);

  const create = async () => {
    if (!title || !target) return;
    setLoading(true);
    try {
      await apiFetch('/api/habits',{method:'POST',body:JSON.stringify({title,target_metric:+target,target_deadline:deadline?new Date(deadline).toISOString():new Date(Date.now()+30*864e5).toISOString()})});
      setOpen(false); setTitle(''); setTarget(''); setDeadline('');
    } catch{} finally { setLoading(false); }
  };

  const log = async (id: string, n: number) => {
    try {
      const u = await apiFetch(`/api/habits/${id}/progress`,{method:'PATCH',body:JSON.stringify({increment:n})});
      const ex = habits.find(h=>h.habit_id===id); if(ex) updateHabit({...ex,...u});
    } catch{}
  };

  const adjustDaily = async (id: string, current: number, delta: number) => {
    const newTarget = Math.max(1, current + delta);
    try {
      const u = await apiFetch(`/api/habits/${id}/today-target`, { method: 'PATCH', body: JSON.stringify({ target: newTarget }) });
      const ex = habits.find(h=>h.habit_id===id); if(ex) updateHabit({...ex, today_target: newTarget});
    } catch{}
  };

  const adjustTotal = async (id: string, current: number, delta: number) => {
    const newTarget = Math.max(1, current + delta);
    try {
      const u = await apiFetch(`/api/habits/${id}/total-target`, { method: 'PATCH', body: JSON.stringify({ target: newTarget }) });
      const ex = habits.find(h=>h.habit_id===id); if(ex) updateHabit({...ex, target_metric: newTarget});
    } catch{}
  };

  const paceBadge: Record<string,string> = { AHEAD:'badge-success', ON_TRACK:'badge-info', BEHIND:'badge-warning' };
  const PaceIcon = ({pace}: {pace:string}) => {
    if (pace === 'AHEAD') return <ArrowUpRight className="w-3 h-3" />;
    if (pace === 'BEHIND') return <ArrowDownRight className="w-3 h-3" />;
    return <ArrowRight className="w-3 h-3" />;
  };

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/api/habits/${id}`, { method: 'DELETE' });
      removeHabit(id);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="premium-card p-5 h-full flex flex-col">
      <div className="flex items-center gap-3 mb-5 shrink-0">
        <div className="w-10 h-10 rounded-xl bg-emerald-900/30 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
          <Target className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-[15px] font-semibold text-white">Goals & Habits</h2>
          <p className="text-[12px] text-white/60">{habits.length} active trackers</p>
        </div>
        <button onClick={()=>setOpen(v=>!v)} className="btn-secondary px-3 py-1.5 text-[12px]">
          {open ? <><X className="w-3.5 h-3.5"/> Cancel</> : <><Plus className="w-3.5 h-3.5"/> Add</>}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div initial={{opacity:0, height:0, marginBottom:0}} animate={{opacity:1, height:'auto', marginBottom:16}} exit={{opacity:0, height:0, marginBottom:0}} className="overflow-hidden">
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-3">
              <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Goal title (e.g., Read 10 books)" className="premium-input text-[13px]" />
              <div className="grid grid-cols-2 gap-3">
                <input type="number" value={target} onChange={e=>setTarget(e.target.value)} placeholder="Target metric (e.g., 10)" className="premium-input text-[13px]" />
                <input type="date" value={deadline} onChange={e=>setDeadline(e.target.value)} className="premium-input text-[13px]" />
              </div>
              <button onClick={create} disabled={loading} className="btn-primary w-full py-2">
                {loading ? 'Creating...' : 'Create Goal'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto flex flex-col gap-3 pr-1">
        {habits.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 opacity-60">
            <div className="w-16 h-16 rounded-2xl bg-white/5/50 border border-white/10/50 flex items-center justify-center">
              <Target className="w-7 h-7 text-white0" />
            </div>
            <p className="text-[13px] text-white/60 text-center leading-relaxed">
              No goals set.<br />Click "+ Add" to create a tracker.
            </p>
          </div>
        ) : (
          <AnimatePresence>
            {habits.map(h => {
              const pct = Math.min(100, Math.round((h.current_progress / h.target_metric)*100));
              return (
                <motion.div key={h.habit_id} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} className="bg-white/5 border border-white/10 rounded-xl p-4 transition-colors hover:bg-white/10 shadow-sm">
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-[13px] font-semibold text-white flex-1 pr-2 truncate">{h.title}</span>
                    <div className="flex items-center gap-2">
                      <span className={`badge ${paceBadge[h.pace_status]||'badge-info'}`}>
                        <PaceIcon pace={h.pace_status} /> {h.pace_status.replace('_',' ')}
                      </span>
                      <button onClick={() => handleDelete(h.habit_id)} className="text-white/30 hover:text-red-400 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {h.today_target !== undefined && (
                    <div className="mb-3 flex items-center justify-between bg-black/20 rounded-lg p-2.5 border border-white/5">
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] text-white/70 font-medium w-16">Today:</span>
                          <button onClick={() => adjustDaily(h.habit_id, h.today_target!, -1)} className="w-5 h-5 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded border border-white/10 text-white/70">-</button>
                          <span className="text-[14px] font-bold text-white min-w-[20px] text-center">{h.today_target}</span>
                          <button onClick={() => adjustDaily(h.habit_id, h.today_target!, 1)} className="w-5 h-5 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded border border-white/10 text-white/70">+</button>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] text-white/70 font-medium w-16">Total:</span>
                          <button onClick={() => adjustTotal(h.habit_id, h.target_metric, -1)} className="w-5 h-5 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded border border-white/10 text-white/70">-</button>
                          <span className="text-[12px] font-bold text-white/50 min-w-[20px] text-center">{h.target_metric}</span>
                          <button onClick={() => adjustTotal(h.habit_id, h.target_metric, 1)} className="w-5 h-5 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded border border-white/10 text-white/70">+</button>
                        </div>
                      </div>
                      {h.is_hectic && (
                        <div className="flex items-center gap-1.5 bg-purple-500/20 border border-purple-500/30 text-purple-300 px-2.5 py-1 rounded-md text-[11px] font-semibold animate-pulse" title={h.hectic_reason || 'Busy day!'}>
                          🛡️ Shield Active
                        </div>
                      )}
                    </div>
                  )}

                  <div className="progress-bg mb-3">
                    <div className="progress-fill" style={{ width:`${pct}%` }} />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-white/60 font-medium">
                      <span className="text-emerald-400 font-bold">{h.current_progress}</span>
                      /{h.target_metric} <span className="text-slate-600 mx-1">•</span> {pct}%
                    </span>
                    <div className="flex gap-1.5">
                      {[1,5,10].map(n=>(
                        <button key={n} onClick={()=>log(h.habit_id,n)} className="btn-secondary px-2 py-1 text-[11px] min-w-[32px]">+{n}</button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
