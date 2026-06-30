"use client";
import React, { useEffect } from 'react';
import { useStore } from '@/store';
import { apiFetch } from '@/lib/api';
import { BrainDumpConsole } from '@/components/BrainDump';
import { ActionDeck } from '@/components/ActionDeck';
import { FluidTimeline } from '@/components/FluidTimeline';
import { HabitsPanel } from '@/components/HabitsPanel';
import { MicroFocusHUD } from '@/components/MicroFocusHUD';
import { MissionLogs } from '@/components/MissionLogs';
import { SettingsModal } from '@/components/SettingsModal';
import { AgendaSidebar } from '@/components/AgendaSidebar';

export default function Home() {
  const setSessionToken = useStore(s => s.setSessionToken);
  const setTasks = useStore(s => s.setTasks);
  const setCalendarBlocks = useStore(s => s.setCalendarBlocks);
  const setHabits = useStore(s => s.setHabits);
  const setMissionLogs = useStore(s => s.setMissionLogs);
  const setChronotype = useStore(s => s.setChronotype);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    
    const currentToken = useStore.getState().sessionToken;

    if (token) {
      setSessionToken(token);
      window.history.replaceState({}, document.title, "/");
      fetchData();
    } else if (currentToken) {
      setSessionToken(currentToken);
      fetchData();
    } else {
      window.location.href = `${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000'}/api/auth/google`;
    }

    function fetchData() {
      apiFetch('/api/users/me').then((res: any) => setChronotype(res.chronotype)).catch(console.error);
      apiFetch('/api/tasks').then(setTasks).catch(console.error);
      apiFetch('/api/schedule').then((res: any) => setCalendarBlocks(res.blocks)).catch(console.error);
      apiFetch('/api/habits').then(setHabits).catch(console.error);
      apiFetch('/api/mission-logs?limit=50').then(setMissionLogs).catch(console.error);
    }
  }, [setSessionToken, setTasks, setCalendarBlocks, setHabits, setMissionLogs, setChronotype]);

  return (
    <main className="min-h-screen p-6 max-w-[1600px] mx-auto flex flex-col">
      <header className="flex justify-end mb-6 shrink-0 gap-4">
        <SettingsModal />
        <div className="badge badge-success flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></div>
          AI ACTIVE
        </div>
      </header>

      <div className="flex-1 flex flex-col xl:flex-row gap-6 min-h-0">
        
        {/* Left Sidebar: Agenda */}
        <div className="shrink-0 flex flex-col min-h-[400px] xl:min-h-0">
          <AgendaSidebar />
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col gap-6 min-w-0">
          <div className="shrink-0">
            <BrainDumpConsole />
          </div>
          <div className="flex-1 flex flex-col xl:flex-row gap-6 min-h-0">
            <div className="flex-1 min-w-0">
              <FluidTimeline />
            </div>
            <div className="flex-1 min-w-0">
              <HabitsPanel />
            </div>
          </div>
        </div>

        <div className="w-full lg:w-[400px] shrink-0 flex flex-col min-h-0">
          <ActionDeck />
        </div>
      </div>

      <MicroFocusHUD />
      <MissionLogs />
    </main>
  );
}
