import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { apiFetch } from '@/lib/api';

export type TaskStatus = 'PENDING' | 'SCHEDULED' | 'COMPLETED' | 'MISSED';
export type EnergyLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type BlockType = 'FIXED_EVENT' | 'FLUID_TASK' | 'HABIT';
export type AgenticActionType = 'EMAIL_DRAFT' | 'NONE';
export type AgenticStatus = 'NOT_APPLICABLE' | 'DRAFTING' | 'NEEDS_REVIEW' | 'APPROVED' | 'SENT' | 'FAILED';

export type MacroContext = 
  | 'OUTSIDE_ERRAND'
  | 'COMPUTER_DEEP'
  | 'COMPUTER_SHALLOW'
  | 'HOME_CHORE'
  | 'COMMUNICATION'
  | 'WELLNESS_FITNESS'
  | 'SOCIAL_LEISURE'
  | 'LEARNING_READING'
  | 'NONE';

export interface Task {
    task_id: string;
    title: string;
    estimated_minutes: number;
    deadline: string;
    energy_required: EnergyLevel;
    is_agentic: boolean;
    agentic_action_type: AgenticActionType;
    agentic_status: AgenticStatus;
    agentic_draft_content?: string;
    status: TaskStatus;
    macro_context?: MacroContext;
}

export interface CalendarBlock {
    block_id: string;
    reference_id: string;
    type_of_block: BlockType;
    start_time: string;
    end_time: string;
    is_locked: boolean;
    task_title?: string;
    task_macro_context?: MacroContext;
}

export interface Habit {
    habit_id: string;
    title: string;
    target_metric: number;
    current_progress: number;
    target_deadline: string;
    pace_status: 'AHEAD' | 'ON_TRACK' | 'BEHIND';
    today_target?: number;
    is_hectic?: boolean;
    hectic_reason?: string;
}

export interface MissionLog {
    log_id: string;
    action_taken: string;
    reasoning: string;
    created_at: string;
}

export interface DraftCard {
    task_id: string;
    draft_subject: string;
    draft_preview: string;
}

interface FluxMindState {
  tasks: Task[];
  calendarBlocks: CalendarBlock[];
  habits: Habit[];
  missionLogs: MissionLog[];
  drafts: DraftCard[];
  activeTask: Task | null;
  unreadLogCount: number;
  sessionToken: string | null;
  socket: Socket | null;
  chronotype: 'morning' | 'night' | null;
  
  setSessionToken: (token: string) => void;
  setChronotype: (type: 'morning' | 'night') => void;
  initSocket: (token: string) => void;
  
  setTasks: (tasks: Task[]) => void;
  setCalendarBlocks: (blocks: CalendarBlock[]) => void;
  setHabits: (habits: Habit[]) => void;
  setMissionLogs: (logs: MissionLog[]) => void;
  setDrafts: (drafts: DraftCard[]) => void;
  
  setActiveTask: (task: Task | null) => void;
  resetUnreadLogCount: () => void;
  
  removeDraft: (taskId: string) => void;
  updateHabit: (habit: Habit) => void;
  removeHabit: (habitId: string) => void;
  updateTaskStatus: (taskId: string, status: TaskStatus) => void;
}

export const useStore = create<FluxMindState>((set, get) => ({
  tasks: [],
  calendarBlocks: [],
  habits: [],
  missionLogs: [],
  drafts: [],
  activeTask: null,
  unreadLogCount: 0,
  sessionToken: typeof window !== 'undefined' ? localStorage.getItem('fluxmind_token') : null,
  socket: null,
  chronotype: null,

  setChronotype: (type) => set({ chronotype: type }),

  setSessionToken: (token) => {
    set({ sessionToken: token });
    if (token) {
      if (typeof window !== 'undefined') localStorage.setItem('fluxmind_token', token);
      get().initSocket(token);
    } else {
      if (typeof window !== 'undefined') localStorage.removeItem('fluxmind_token');
    }
  },

  initSocket: (token) => {
    const existingSocket = get().socket;
    if (existingSocket) {
      existingSocket.disconnect();
    }

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
    const socket = io(backendUrl, {
      auth: { token },
      withCredentials: true,
    });

    socket.on('connect_error', (err) => {
      if (err.message === 'unauthorized') {
        window.location.href = `${backendUrl}/api/auth/google`;
      }
    });

    socket.on('schedule:update', (data: { changed_blocks: any[], full_replacement?: boolean }) => {
      // Refetch habits to instantly trigger Hectic Day Shield if schedule overload threshold is crossed
      apiFetch('/api/habits').then(get().setHabits).catch(console.error);

      set((state) => {
        if (data.full_replacement && data.all_blocks) {
          return { calendarBlocks: data.all_blocks };
        } else if (data.full_replacement) {
          const nonFluid = state.calendarBlocks.filter(b => b.type_of_block !== 'FLUID_TASK');
          const newFluid = data.changed_blocks.map(c => ({
            block_id: c.block_id,
            reference_id: c.reference_id,
            type_of_block: 'FLUID_TASK' as const,
            start_time: c.start_time,
            end_time: c.end_time,
            is_locked: false,
            task_title: c.task_title,
          }));
          return { calendarBlocks: [...nonFluid, ...newFluid] };
        }

        let newBlocks = [...state.calendarBlocks];
        for (const changed of data.changed_blocks) {
          if (changed.action === 'REMOVED') {
            newBlocks = newBlocks.filter(b => b.block_id !== changed.block_id);
          } else if (changed.action === 'CREATED' || changed.action === 'MOVED') {
            const idx = newBlocks.findIndex(b => b.block_id === changed.block_id);
            const updatedBlock = {
              block_id: changed.block_id,
              reference_id: changed.reference_id,
              type_of_block: 'FLUID_TASK' as const,
              start_time: changed.start_time,
              end_time: changed.end_time,
              is_locked: false,
              task_title: changed.task_title,
            };
            if (idx >= 0) newBlocks[idx] = { ...newBlocks[idx], ...updatedBlock };
            else newBlocks.push(updatedBlock as any);
          }
        }
        return { calendarBlocks: newBlocks };
      });
    });

    socket.on('mission_log:new', (log: MissionLog) => {
      set((state) => ({
        missionLogs: [log, ...state.missionLogs],
        unreadLogCount: state.unreadLogCount + 1,
      }));
    });

    socket.on('draft:ready', (data: any) => {
      set((state) => ({
        drafts: [...state.drafts, data]
      }));
    });

    socket.on('habit:behind_pace', (data: any) => {
       // We can dispatch a custom event or set a state for a global toast.
       window.dispatchEvent(new CustomEvent('habit:behind_pace', { detail: data }));
    });

    set({ socket });
  },

  setTasks: (tasks) => {
    const drafts: DraftCard[] = [];
    tasks.forEach(t => {
      if (t.agentic_status === 'DRAFTED' && t.agentic_draft_content) {
        const parts = t.agentic_draft_content.split('\n\n');
        const headerLines = parts[0]?.split('\n') || [];
        const subject = headerLines.find(l => l.startsWith('Subject: '))?.replace('Subject: ', '') || t.title;
        const preview = parts.slice(1).join('\n\n').substring(0, 100);
        drafts.push({
          task_id: t.task_id,
          draft_subject: subject,
          draft_preview: preview
        });
      }
    });
    set({ tasks, drafts });
  },
  setCalendarBlocks: (calendarBlocks) => set({ calendarBlocks }),
  setHabits: (habits) => set({ habits }),
  setMissionLogs: (missionLogs) => set({ missionLogs }),
  setDrafts: (drafts) => set({ drafts }),
  
  setActiveTask: (activeTask) => set({ activeTask }),
  resetUnreadLogCount: () => set({ unreadLogCount: 0 }),
  
  removeDraft: (taskId) => set((state) => ({ drafts: state.drafts.filter(d => d.task_id !== taskId) })),
  updateHabit: (habit) => set((state) => ({
    habits: state.habits.map(h => h.habit_id === habit.habit_id ? habit : h)
  })),
  removeHabit: (habitId) => set((state) => ({
    habits: state.habits.filter(h => h.habit_id !== habitId)
  })),
  updateTaskStatus: (taskId, status) => set((state) => ({
    tasks: state.tasks.map(t => t.task_id === taskId ? { ...t, status } : t)
  })),
}));
