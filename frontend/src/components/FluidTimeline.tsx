"use client";
import React from 'react';
import { useStore, CalendarBlock } from '@/store';
import { apiFetch } from '@/lib/api';
import { Calendar, Play, Lock } from 'lucide-react';
import { motion } from 'framer-motion';

const COLORS: Record<string, {accent:string,bg:string,border:string,text:string}> = {
  FLUID_TASK:  { accent:'#818cf8', bg:'#312e81', border:'#4338ca', text:'#e0e7ff' },
  FIXED_EVENT: { accent:'#94a3b8', bg:'#1e293b', border:'#334155', text:'#cbd5e1' },
  HABIT:       { accent:'#34d399', bg:'#064e3b', border:'#047857', text:'#a7f3d0' },
};

export function FluidTimeline() {
  const blocks = useStore(s => s.calendarBlocks);
  const tasks  = useStore(s => s.tasks);
  const setActiveTask = useStore(s => s.setActiveTask);
  const chronotype = useStore(s => s.chronotype);
  const H0 = 0;
  const H1 = 24;
  const SPAN = H1 - H0;

  const now = new Date();
  let currentH = now.getHours() + now.getMinutes() / 60;
  if (currentH < H0 && currentH < 4) currentH += 24; // Rollover for current time indicator
  const nowPct = Math.max(0, Math.min(100, ((currentH - H0)/SPAN)*100));

  const startBlock = async (b: CalendarBlock) => {
    if (b.type_of_block !== 'FLUID_TASK') return;
    try { const t = await apiFetch(`/api/tasks/${b.reference_id}/start`,{method:'POST'}); setActiveTask(t); } catch {}
  };
  const handleDrop = async (e: React.DragEvent<HTMLDivElement>, logicalDayStart: Date) => {
    e.preventDefault();
    const blockId = e.dataTransfer.getData('text/plain');
    if (!blockId) return;

    const block = blocks.find(b => String(b.block_id) === blockId);
    if (!block) return;

    // Calculate drop hour based on Y position
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const topPct = (y / rect.height);
    const dropHour = topPct * SPAN;

    // Calculate new start/end time
    const newStart = new Date(logicalDayStart);
    newStart.setHours(H0 + Math.floor(dropHour), (dropHour % 1) * 60, 0, 0);

    const originalStart = new Date(block.start_time).getTime();
    const originalEnd = new Date(block.end_time).getTime();
    const durationMs = originalEnd - originalStart;

    const newEnd = new Date(newStart.getTime() + durationMs);

    try {
      await apiFetch(`/api/blocks/${blockId}/lock`, {
        method: 'PUT',
        body: JSON.stringify({
          start_time: newStart.toISOString(),
          end_time: newEnd.toISOString()
        })
      });
    } catch (err) {
      console.error(err);
    }
  };
  const labels = Array.from({length: SPAN+1}, (_,i) => {
    const h = H0+i; 
    const actualH = h % 24;
    const isPM = actualH >= 12 && actualH < 24;
    const displayH = actualH > 12 ? actualH - 12 : actualH === 0 ? 12 : actualH;
    return { h, label: `${displayH}${isPM?'pm':'am'}` };
  });

  // Calculate timeline days (starts from today, expands dynamically to furthest scheduled task, min 7 days)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let furthestDate = new Date(today);
  furthestDate.setDate(today.getDate() + 6); // default to at least today + 6 (7 days total)

  for (const b of blocks) {
    const bDate = new Date(b.end_time);
    bDate.setHours(0, 0, 0, 0);
    if (bDate > furthestDate) {
      furthestDate = bDate;
    }
  }

  const timeDiff = furthestDate.getTime() - today.getTime();
  const dayDiff = Math.round(timeDiff / (1000 * 3600 * 24));
  const totalDays = Math.max(7, dayDiff + 1);

  const weekDays = Array.from({length: totalDays}, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });

  const isSameLogicalDay = (nowDate: Date, logicalDayStart: Date, logicalDayEnd: Date) => {
    return nowDate >= logicalDayStart && nowDate < logicalDayEnd;
  };

  return (
    <div className="premium-card p-5 h-full flex flex-col min-w-0 w-full">
      <div className="flex items-center gap-3 mb-5 shrink-0">
        <div className="w-10 h-10 rounded-xl bg-sky-900/30 border border-sky-500/30 flex items-center justify-center text-sky-400">
          <Calendar className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-[15px] font-semibold text-white">Timeline</h2>
          <p className="text-[12px] text-white/60">{now.toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})}</p>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden flex flex-col min-w-0 w-full relative">
        <div className="flex flex-col h-full" style={{ minWidth: Math.max(700, totalDays * 100) }}>
          {/* Header Row for Days */}
          <div className="flex pl-12 pr-2 mb-3 shrink-0">
            {weekDays.map((day, i) => {
              const logicalDayStart = new Date(day); logicalDayStart.setHours(H0,0,0,0);
              const logicalDayEnd = new Date(day); logicalDayEnd.setHours(H1,0,0,0);
              const isToday = isSameLogicalDay(now, logicalDayStart, logicalDayEnd);
              return (
                <div key={i} className={`flex-1 text-center pb-2 border-b ${isToday ? 'border-red-500' : 'border-white/10/50'}`}>
                  <div className={`text-[11px] font-bold uppercase tracking-wider ${isToday ? 'text-red-500' : 'text-white/60'}`}>
                    {day.toLocaleDateString('en-US', { weekday: 'short' })}
                  </div>
                  <div className={`text-[14px] font-semibold ${isToday ? 'text-white' : 'text-white0'}`}>
                    {day.getDate()}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Timeline Body */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            <div className="relative pl-12 pr-2 pb-8" style={{ minHeight: 1200 }}>
            {/* Hour ticks across the whole width */}
            {labels.map(({h,label},i) => (
              <div key={h} className="absolute left-0 w-full flex items-center z-0 pointer-events-none" style={{ top:`${(i/SPAN)*100}%` }}>
                <span className="w-9 text-[10px] text-white0 font-['Fira_Code'] text-right shrink-0">{label}</span>
                <div className="flex-1 h-[1px] bg-slate-700/50 ml-3" />
              </div>
            ))}

            {/* 7 Columns */}
            <div className="absolute top-0 bottom-0 left-12 right-2 flex">
              {weekDays.map((day, colIdx) => {
                const logicalDayStart = new Date(day); logicalDayStart.setHours(H0,0,0,0);
                const logicalDayEnd = new Date(day); logicalDayEnd.setHours(H1,0,0,0);
                const isToday = isSameLogicalDay(now, logicalDayStart, logicalDayEnd);
                
                // Filter blocks for this logical day
                const dayBlocks = blocks.filter(b => {
                  const s = new Date(b.start_time);
                  return s >= logicalDayStart && s < logicalDayEnd;
                });

                return (
                  <div key={colIdx} 
                    className={`flex-1 relative border-r border-white/10/50 ${isToday ? 'bg-white/5' : ''}`}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleDrop(e, logicalDayStart)}
                  >
                    
                    {/* NOW line (only in today's column) */}
                    {isToday && (
                      <div suppressHydrationWarning className="absolute left-0 right-0 flex items-center z-20 pointer-events-none" style={{ top:`${nowPct}%`, transform: 'translateY(-50%)' }}>
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 shadow-[0_0_8px_#ef4444] -ml-[3px]" />
                        <div className="flex-1 h-[1px] bg-red-500/40" />
                      </div>
                    )}

                    {/* Blocks for this day */}
                    {(() => {
                      const sortedBlocks = [...dayBlocks].sort((a,b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
                      const columns: any[][] = [];
                      sortedBlocks.forEach(b => {
                        let placed = false;
                        for (let i = 0; i < columns.length; i++) {
                          const lastInCol = columns[i][columns[i].length - 1];
                          const lastVisualDurationMs = Math.max(
                            new Date(lastInCol.end_time).getTime() - new Date(lastInCol.start_time).getTime(),
                            0.025 * SPAN * 3.6e6
                          );
                          const lastVisualEndTime = new Date(lastInCol.start_time).getTime() + lastVisualDurationMs;

                          if (new Date(b.start_time).getTime() >= lastVisualEndTime) {
                            columns[i].push(b);
                            (b as any)._col = i;
                            placed = true;
                            break;
                          }
                        }
                        if (!placed) {
                          columns.push([b]);
                          (b as any)._col = columns.length - 1;
                        }
                      });
                      const totalCols = columns.length || 1;

                      return sortedBlocks.map(b => {
                        const s = new Date(b.start_time), e = new Date(b.end_time);
                        const top = Math.max(0, ((s.getTime()-logicalDayStart.getTime())/(SPAN*3.6e6))*100);
                        const ht  = Math.max(2.5, ((e.getTime()-s.getTime())/(SPAN*3.6e6))*100);
                        const c = COLORS[b.type_of_block] || COLORS.FIXED_EVENT;
                        const isFluid = b.type_of_block === 'FLUID_TASK';
                        
                        // Apple Calendar style cascading for overlaps
                        const col = (b as any)._col || 0;
                        const leftPx = 4 + (col * 14); 
                        const rightPx = 4 + ((totalCols - 1 - col) * 8); 
                        const zIdx = 10 + col;

                        return (
                          <motion.div key={b.block_id} onClick={()=>startBlock(b)} 
                            title={`${b.task_title || 'Untitled'} (${new Date(b.start_time).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})})`}
                            initial={{opacity:0, scale:0.95}} animate={{opacity:1, scale:1}}
                            draggable={true}
                            onDragStart={(e: any) => e.dataTransfer.setData('text/plain', String(b.block_id))}
                            className={`absolute rounded-lg p-1.5 flex flex-col overflow-hidden backdrop-blur-md transition-all duration-200 cursor-grab active:cursor-grabbing hover:!z-[60] hover:!scale-[1.02] hover:shadow-xl ${isFluid ? 'hover:brightness-125' : ''}`}
                            style={{ 
                              top: `${top}%`, 
                              height: `${ht}%`, 
                              left: `${leftPx}px`, 
                              right: `${rightPx}px`,
                              zIndex: zIdx,
                              background: c.bg, 
                              borderTop: `1px solid ${c.border}`, 
                              borderRight: `1px solid ${c.border}`, 
                              borderBottom: `1px solid ${c.border}`, 
                              borderLeft: `3px solid ${c.accent}` 
                            }}
                          >
                            <div className="flex items-start justify-between gap-1 mb-0.5">
                              <div className="text-[10px] font-semibold text-white truncate leading-tight flex-1 drop-shadow-md">
                                {b.task_macro_context === 'OUTSIDE_ERRAND' && '🚗 '}
                                {b.task_macro_context === 'COMPUTER_DEEP' && '💻 '}
                                {b.task_macro_context === 'COMPUTER_SHALLOW' && '🖱️ '}
                                {b.task_macro_context === 'HOME_CHORE' && '🏠 '}
                                {b.task_macro_context === 'COMMUNICATION' && '💬 '}
                                {b.task_macro_context === 'WELLNESS_FITNESS' && '💪 '}
                                {b.task_macro_context === 'SOCIAL_LEISURE' && '🎉 '}
                                {b.task_macro_context === 'LEARNING_READING' && '📚 '}
                                {b.task_title || 'Untitled'}
                              </div>
                              {isFluid ? <Play className="w-3 h-3 shrink-0 mt-[1px] drop-shadow-md" style={{ color: c.text }} /> : <Lock className="w-3 h-3 shrink-0 opacity-50 mt-[1px]" style={{ color: c.text }} />}
                            </div>
                            {ht > 3 && (
                              <div className="text-[9px] font-['Fira_Code'] opacity-90 truncate drop-shadow-md" style={{ color: c.text }}>
                                {new Date(b.start_time).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true}).replace(' AM','a').replace(' PM','p')}
                              </div>
                            )}
                          </motion.div>
                        );
                      });
                    })()}
                  </div>
                );
              })}
            </div>

            {blocks.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center opacity-60 z-0 pointer-events-none">
                <Calendar className="w-12 h-12 text-white0 mb-3" />
                <p className="text-[13px] text-white/60 text-center">No blocks scheduled.<br/>Brain dump to populate timeline.</p>
              </div>
            )}
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
