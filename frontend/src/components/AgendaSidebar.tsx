"use client";

import React, { useState } from 'react';
import { useStore } from '@/store';
import { ChevronLeft, ChevronRight, Clock, Lock, Play, Calendar as CalendarIcon } from 'lucide-react';
import { motion } from 'framer-motion';

function isSameLogicalDay(d1: Date, logicalStart: Date, logicalEnd: Date) {
  return d1 >= logicalStart && d1 < logicalEnd;
}

const COLORS: Record<string, { bg: string; border: string; accent: string; text: string }> = {
  FIXED_EVENT: { bg: 'rgba(30, 41, 59, 0.95)', border: 'rgba(51, 65, 85, 0.5)', accent: '#475569', text: '#94a3b8' },
  FLUID_TASK: { bg: 'rgba(49, 46, 129, 0.95)', border: 'rgba(67, 56, 202, 0.5)', accent: '#6366f1', text: '#a5b4fc' },
};

export function AgendaSidebar() {
  const blocks = useStore(s => s.calendarBlocks);
  const H0 = 0;
  const H1 = 24;
  
  const [isOpen, setIsOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Logic to move days
  const changeDate = (days: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);
    setSelectedDate(newDate);
  };
  const goToday = () => setSelectedDate(new Date());

  // Compute logical day bounds for the selected date
  const logicalStart = new Date(selectedDate);
  logicalStart.setHours(H0, 0, 0, 0);
  const logicalEnd = new Date(selectedDate);
  logicalEnd.setHours(H1, 0, 0, 0);
  // Add 1 day if H1 < H0 (e.g. 6am to 2am next day)
  if (H1 <= H0) {
    logicalEnd.setDate(logicalEnd.getDate() + 1);
  }

  // Filter and sort blocks for this day
  const dayBlocks = blocks
    .filter(b => isSameLogicalDay(new Date(b.start_time), logicalStart, logicalEnd))
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  // Date formatting for the header
  const isToday = new Date().toDateString() === selectedDate.toDateString();
  const dateStr = selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  if (!isOpen) {
    return (
      <div 
        onClick={() => setIsOpen(true)}
        className="flex flex-col items-center py-6 h-full w-14 bg-[#0b0e14] border border-white/10 rounded-2xl shadow-2xl cursor-pointer hover:bg-white/5 transition-colors group"
      >
        <CalendarIcon className="w-5 h-5 text-indigo-400 mb-4 group-hover:scale-110 transition-transform" />
        <div className="flex-1 flex" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
          <span className="text-sm font-semibold tracking-widest text-white/50 group-hover:text-white/80 transition-colors uppercase">
            Agenda View
          </span>
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ width: 56, opacity: 0 }}
      animate={{ width: 280, opacity: 1 }}
      className="flex flex-col h-full w-full xl:w-[280px] bg-[#0b0e14] border border-white/10 rounded-2xl overflow-hidden shadow-2xl relative"
    >
      {/* Header / Date Selector */}
      <div className="shrink-0 p-4 border-b border-white/10 bg-white/[0.02]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white/90 flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-indigo-400" />
            Agenda
          </h2>
          <div className="flex items-center gap-2">
            <button onClick={goToday} className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors bg-indigo-500/10 px-2 py-1 rounded-md">
              Today
            </button>
            <button onClick={() => setIsOpen(false)} className="p-1 rounded hover:bg-white/10 text-white/50 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        <div className="flex items-center justify-between bg-white/5 rounded-lg p-1">
          <button onClick={() => changeDate(-1)} className="p-1.5 rounded hover:bg-white/10 transition-colors text-white/50 hover:text-white">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex flex-col items-center">
            <span className={`text-[13px] font-bold ${isToday ? 'text-indigo-400' : 'text-white'}`}>
              {isToday ? 'Today' : selectedDate.toLocaleDateString('en-US', { weekday: 'long' })}
            </span>
            <span className="text-[10px] text-white/50 uppercase tracking-wider">{dateStr}</span>
          </div>
          <button onClick={() => changeDate(1)} className="p-1.5 rounded hover:bg-white/10 transition-colors text-white/50 hover:text-white">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {dayBlocks.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-50 space-y-3">
            <CalendarIcon className="w-8 h-8 text-white/30" />
            <div>
              <p className="text-sm text-white/70">No tasks scheduled</p>
              <p className="text-xs text-white/40 mt-1">AI has not scheduled anything<br/>for this day yet.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {dayBlocks.map((block, idx) => {
              const start = new Date(block.start_time);
              const end = new Date(block.end_time);
              const isFluid = block.type_of_block === 'FLUID_TASK';
              const c = COLORS[block.type_of_block] || COLORS.FIXED_EVENT;

              return (
                <motion.div 
                  key={block.block_id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="relative flex items-stretch gap-3 group"
                >
                  {/* Timeline Indicator */}
                  <div className="flex flex-col items-center pt-1 shrink-0">
                    <div className="w-2.5 h-2.5 rounded-full z-10" style={{ backgroundColor: c.accent }} />
                    <div className="w-[1.5px] h-full flex-1 mt-1 opacity-20" style={{ backgroundColor: c.accent }} />
                  </div>

                  {/* Card */}
                  <div className="flex-1 p-3.5 rounded-xl border backdrop-blur-md shadow-sm transition-all hover:-translate-y-[1px] hover:shadow-lg"
                       style={{ 
                         backgroundColor: c.bg, 
                         borderColor: c.border,
                       }}>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="text-[13px] font-medium text-white leading-tight">
                        {block.task_macro_context === 'OUTSIDE_ERRAND' && '🚗 '}
                        {block.task_macro_context === 'COMPUTER_DEEP' && '💻 '}
                        {block.task_macro_context === 'COMPUTER_SHALLOW' && '🖱️ '}
                        {block.task_macro_context === 'HOME_CHORE' && '🏠 '}
                        {block.task_macro_context === 'COMMUNICATION' && '💬 '}
                        {block.task_macro_context === 'WELLNESS_FITNESS' && '💪 '}
                        {block.task_macro_context === 'SOCIAL_LEISURE' && '🎉 '}
                        {block.task_macro_context === 'LEARNING_READING' && '📚 '}
                        {block.task_title || 'Untitled'}
                      </div>
                      {isFluid ? (
                        <Play className="w-3.5 h-3.5 shrink-0 mt-[2px]" style={{ color: c.accent }} />
                      ) : (
                        <Lock className="w-3 h-3 shrink-0 opacity-60 mt-[2px]" style={{ color: c.accent }} />
                      )}
                    </div>
                    
                    <div className="flex items-center gap-1.5 pt-2 border-t border-white/10">
                      <Clock className="w-3 h-3 opacity-60" style={{ color: c.text }} />
                      <div className="text-[11px] font-['Fira_Code'] opacity-90" style={{ color: c.text }}>
                        {start.toLocaleTimeString('en-US', {hour:'numeric', minute:'2-digit'})} - {end.toLocaleTimeString('en-US', {hour:'numeric', minute:'2-digit'})}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
