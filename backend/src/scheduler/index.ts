import { Task, CalendarBlock, TaskDependency, EnergyLevel as BaseEnergyLevel } from '../types';

export type EnergyLevel = BaseEnergyLevel | 'SLEEP';

export type FixedEvent = CalendarBlock & { type_of_block: 'FIXED_EVENT' };
export type FluidTask = Task;

export interface EnergyProfile {
  [hour: number]: EnergyLevel;
}

export interface ScheduleResult {
  calendar_blocks: CalendarBlock[];
  unplaceable_tasks: string[];
  logs: { task_id: string; title: string; action: string; reasoning: string }[];
}

export class CyclicDependencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CyclicDependencyError';
  }
}

export function getEnergyProfile(chronotype: 'morning' | 'night' = 'morning'): EnergyProfile {
  const profile: EnergyProfile = {};
  
  const getEnergy = (h: number): EnergyLevel => {
    if (chronotype === 'night') {
      // Night Owl: Wakes up at 11 AM
      if (h >= 3 && h < 11) return 'SLEEP';
      if (h >= 11 && h < 13) return 'LOW'; // Wake up grogginess (11 AM - 1 PM)
      if (h >= 13 && h < 17) return 'HIGH'; // Deep work (1 PM - 5 PM)
      if (h >= 17 && h < 21) return 'LOW'; // Lunch dip / Errands (5 PM - 9 PM)
      if (h >= 21 || h < 1) return 'MEDIUM'; // Second wind (9 PM - 1 AM)
      if (h >= 1 && h < 3) return 'LOW'; // Winding down (1 AM - 3 AM)
      return 'LOW'; // Fallback
    } else {
      // Morning Person: Wakes up at 6 AM
      if (h >= 22 || h < 6) return 'SLEEP';
      if (h >= 6 && h < 8) return 'LOW'; // Wake up grogginess (6 AM - 8 AM)
      if (h >= 8 && h < 12) return 'HIGH'; // Deep work (8 AM - 12 PM)
      if (h >= 12 && h < 16) return 'LOW'; // Lunch dip / Errands (12 PM - 4 PM)
      if (h >= 16 && h < 20) return 'MEDIUM'; // Second wind (4 PM - 8 PM)
      if (h >= 20 && h < 22) return 'LOW'; // Winding down (8 PM - 10 PM)
      return 'LOW'; // Fallback
    }
  };

  for (let h = 0; h < 24; h++) {
    profile[h] = getEnergy(h);
  }
  return profile;
}

function topologicalSort(tasks: FluidTask[], dependencies: TaskDependency[]): FluidTask[] {
  const adjList = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  tasks.forEach((t) => {
    adjList.set(t.task_id, []);
    inDegree.set(t.task_id, 0);
  });

  dependencies.forEach((d) => {
    // d.task_id depends on d.depends_on_task_id
    if (adjList.has(d.depends_on_task_id) && adjList.has(d.task_id)) {
      adjList.get(d.depends_on_task_id)!.push(d.task_id);
      inDegree.set(d.task_id, inDegree.get(d.task_id)! + 1);
    }
  });

  const queue: string[] = [];
  inDegree.forEach((count, taskId) => {
    if (count === 0) queue.push(taskId);
  });

  const taskMap = new Map(tasks.map(t => [t.task_id, t]));

  const sortedTasks: string[] = [];
  while (queue.length > 0) {
    // Sort queue by Calendar Date, then Macro-Context, then exact Deadline, then Energy
    queue.sort((a, b) => {
      const taskA = taskMap.get(a)!;
      const taskB = taskMap.get(b)!;
      
      const dateA = new Date(taskA.deadline);
      const dateB = new Date(taskB.deadline);
      
      // 1. Sort by Calendar Date (YYYY-MM-DD)
      const dayA = `${dateA.getFullYear()}-${dateA.getMonth()}-${dateA.getDate()}`;
      const dayB = `${dateB.getFullYear()}-${dateB.getMonth()}-${dateB.getDate()}`;
      if (dayA !== dayB) return dayA.localeCompare(dayB);
      
      // 2. Sort by Macro-Context (to group them together)
      const ctxA = taskA.macro_context || 'NONE';
      const ctxB = taskB.macro_context || 'NONE';
      if (ctxA !== ctxB) return ctxA.localeCompare(ctxB);
      
      // 3. Sort by Exact Deadline
      const timeDiff = dateA.getTime() - dateB.getTime();
      if (timeDiff !== 0) return timeDiff;
      
      // 4. Sort by Energy
      const getEnergyWeight = (energy: string) => energy === 'HIGH' ? 3 : energy === 'MEDIUM' ? 2 : 1;
      return getEnergyWeight(taskB.energy_required) - getEnergyWeight(taskA.energy_required);
    });

    const current = queue.shift()!;
    sortedTasks.push(current);

    adjList.get(current)?.forEach((neighbor) => {
      inDegree.set(neighbor, inDegree.get(neighbor)! - 1);
      if (inDegree.get(neighbor) === 0) queue.push(neighbor);
    });
  }

  if (sortedTasks.length !== tasks.length) {
    throw new CyclicDependencyError('Circular dependency detected');
  }

  return sortedTasks.map(id => taskMap.get(id)!);
}

export function computeSchedule(
  fixedEvents: FixedEvent[],
  fluidTasks: FluidTask[],
  dependencies: TaskDependency[],
  weekStart: Date,
  chronotype: 'morning' | 'night' = 'morning'
): ScheduleResult {
  const energyProfile = getEnergyProfile(chronotype);
  const result: ScheduleResult = {
    calendar_blocks: [],
    unplaceable_tasks: [],
    logs: []
  };

  const MS_PER_15_MIN = 15 * 60 * 1000;
  const TOTAL_SLOTS = 30 * 24 * 4; // 30 days
  const slots: boolean[] = new Array(TOTAL_SLOTS).fill(false);
  const weekStartMs = weekStart.getTime();

  // 1. Mark FIXED_EVENT slots as occupied
  fixedEvents.forEach((ev) => {
    const startIdx = Math.floor((new Date(ev.start_time).getTime() - weekStartMs) / MS_PER_15_MIN);
    const endIdx = Math.floor((new Date(ev.end_time).getTime() - weekStartMs) / MS_PER_15_MIN);
    for (let i = Math.max(0, startIdx); i < Math.min(TOTAL_SLOTS, endIdx); i++) {
      slots[i] = true;
    }
    result.calendar_blocks.push(ev); // Keep fixed events in the result
  });

  // 2. Topological sort
  let sortedTasks: FluidTask[];
  try {
    sortedTasks = topologicalSort(fluidTasks, dependencies);
  } catch (e: any) {
    throw e; 
  }

  // 3. Keep track of completion time for each task to enforce dependencies
  const taskCompletionSlot = new Map<string, number>();

  // Helper to find slots
    const findContiguousSlots = (
      neededSlots: number,
      deadlineIdx: number,
      earliestStartIdx: number,
      idealEnergy: EnergyLevel | null,
      businessHoursOnly: boolean
    ): number => {
    // 1. Task Classification
    const isHeavy = idealEnergy === 'HIGH' || neededSlots > 8; // > 2 hours

    const checkSlots = (startI: number, reqEnergy: EnergyLevel | null) => {
      let canFit = true;
      let matchesEnergy = true;
      
      for (let j = 0; j < neededSlots; j++) {
        if (slots[startI + j]) {
          canFit = false;
          break;
        }
        const hourOfDay = Math.floor(((startI + j) % 96) / 4);
        
        if (businessHoursOnly && (hourOfDay < 9 || hourOfDay >= 20)) {
          matchesEnergy = false;
        }

        const slotEnergy = energyProfile[hourOfDay];
        
        if (slotEnergy === 'SLEEP') {
          matchesEnergy = false;
        } else if (reqEnergy) {
          // If a specific energy is requested, check if slot meets it
          if (reqEnergy === 'HIGH' && slotEnergy !== 'HIGH') matchesEnergy = false;
          if (reqEnergy === 'MEDIUM' && slotEnergy === 'LOW') matchesEnergy = false;
          // Protect HIGH slots from being wasted on LOW tasks
          if (reqEnergy === 'LOW' && slotEnergy === 'HIGH') matchesEnergy = false;
        }
      }
      return { canFit, matchesEnergy };
    };

    if (isHeavy) {
      // Heavy task: Search forwards ASAP
      for (let i = earliestStartIdx; i <= deadlineIdx - neededSlots; i++) {
        const { canFit, matchesEnergy } = checkSlots(i, idealEnergy);
        if (canFit && matchesEnergy) {
          return i;
        }
      }
      
      // Attempt 2 (Fallback): Ignore energy constraints
      for (let i = earliestStartIdx; i <= deadlineIdx - neededSlots; i++) {
        const { canFit } = checkSlots(i, null);
        if (canFit) {
          return i;
        }
      }
      
      return -1;
    } else {
      // Minor task: Search forwards ASAP
      for (let i = earliestStartIdx; i <= deadlineIdx - neededSlots; i++) {
        const { canFit, matchesEnergy } = checkSlots(i, idealEnergy);
        if (canFit && matchesEnergy) {
          return i;
        }
      }
      
      // Attempt 2 (Desperation): Ignore energy constraints
      for (let i = earliestStartIdx; i <= deadlineIdx - neededSlots; i++) {
        const { canFit } = checkSlots(i, null);
        if (canFit) {
          return i;
        }
      }
      
      return -1;
    }
  };

  const contextClusters: Record<string, string> = {
    'COMPUTER_DEEP': 'Desk',
    'COMPUTER_SHALLOW': 'Desk',
    'COMMUNICATION': 'Desk',
    'OUTSIDE_ERRAND': 'Out of House',
    'HOME_CHORE': 'Home',
    'WELLNESS_FITNESS': 'Wellness',
    'SOCIAL_LEISURE': 'Leisure',
    'LEARNING_READING': 'Learning'
  };
  const lastClusterStartIdx: Record<string, number> = {};
  const lastClusterCompletionIdx: Record<string, number> = {};

  console.log(`[Scheduler] Starting loop with ${sortedTasks.length} tasks. earliestStartIdx approx ${Math.max(0, Math.ceil((Date.now() - weekStartMs) / MS_PER_15_MIN))}`);

  for (const task of sortedTasks) {
    // Check if task ALREADY has a FIXED_EVENT block
    const fixedEv = fixedEvents.find(ev => ev.reference_id === task.task_id);
    if (fixedEv) {
      // It's already manually scheduled! Record its completion time for dependencies.
      const endIdx = Math.floor((new Date(fixedEv.end_time).getTime() - weekStartMs) / MS_PER_15_MIN);
      taskCompletionSlot.set(task.task_id, endIdx);
      continue;
    }

    const neededSlots = Math.ceil(task.estimated_minutes / 15);
    const deadlineMs = new Date(task.deadline).getTime();
    const deadlineIdx = Math.min(TOTAL_SLOTS, Math.floor((deadlineMs - weekStartMs) / MS_PER_15_MIN));
    
    // Find earliest start index based on current time, dependencies, or start_after constraint
    let earliestStartIdx = Math.max(0, Math.ceil((Date.now() - weekStartMs) / MS_PER_15_MIN));
    
    if (task.start_after) {
      const startAfterMs = new Date(task.start_after).getTime();
      const startAfterIdx = Math.ceil((startAfterMs - weekStartMs) / MS_PER_15_MIN);
      earliestStartIdx = Math.max(earliestStartIdx, startAfterIdx);
    }
    let latestParentCompletion = -1;
    const deps = dependencies.filter(d => d.task_id === task.task_id);
    for (const dep of deps) {
      const parentCompletion = taskCompletionSlot.get(dep.depends_on_task_id);
      if (parentCompletion !== undefined) {
        earliestStartIdx = Math.max(earliestStartIdx, parentCompletion);
        latestParentCompletion = Math.max(latestParentCompletion, parentCompletion);
      }
    }

    let startIdx = -1;
    let outOfIdealEnergy = false;

    // Helper to check snap candidates strictly against sleep constraints
    const trySnap = (snapIdx: number) => {
      if (snapIdx >= earliestStartIdx && snapIdx + neededSlots <= deadlineIdx) {
        let canSnap = true;
        for (let j = 0; j < neededSlots; j++) {
          if (slots[snapIdx + j]) { canSnap = false; break; }
          const hr = new Date(weekStartMs + (snapIdx + j) * MS_PER_15_MIN).getHours();
          if (energyProfile[hr] === 'SLEEP') { canSnap = false; break; }
        }
        if (canSnap && task.business_hours_only) {
          const hr = new Date(weekStartMs + snapIdx * MS_PER_15_MIN).getHours();
          if (hr < 8 || hr >= 20) canSnap = false;
        }
        if (canSnap) {
          startIdx = snapIdx;
          outOfIdealEnergy = true;
          return true;
        }
      }
      return false;
    };

    // 1. DEPENDENCY CHAINING OVERRIDE
    if (latestParentCompletion !== -1) {
      trySnap(latestParentCompletion);
    }

    // 2. CONTEXT BATCHING OVERRIDE (Clusters)
    if (startIdx === -1 && task.macro_context && task.macro_context !== 'NONE') {
      const cluster = contextClusters[task.macro_context] || task.macro_context;
      const completionIdx = lastClusterCompletionIdx[cluster];
      const previousStartIdx = lastClusterStartIdx[cluster];
      
      // Try to snap after
      if (completionIdx !== undefined) {
        trySnap(completionIdx);
      }
      // Try to snap before
      if (startIdx === -1 && previousStartIdx !== undefined) {
        trySnap(previousStartIdx - neededSlots);
      }
    }

    // Normal search if snapping failed or wasn't applicable
    if (startIdx === -1) {
      startIdx = findContiguousSlots(neededSlots, deadlineIdx, earliestStartIdx, task.energy_required, task.business_hours_only || false);
      
      // Fallback if not found
      if (startIdx === -1) {
        startIdx = findContiguousSlots(neededSlots, deadlineIdx, earliestStartIdx, null, task.business_hours_only || false);
        if (startIdx !== -1) {
          outOfIdealEnergy = true;
        }
      }
    }

    console.log(`[Scheduler] Task: ${task.title}, neededSlots: ${neededSlots}, earliest: ${earliestStartIdx}, deadlineIdx: ${deadlineIdx}, startIdx: ${startIdx}`);

    if (startIdx === -1) {
      // Unplaceable
      result.unplaceable_tasks.push(task.task_id);
      result.logs.push({
        task_id: task.task_id,
        title: task.title,
        action: `Could not fit ${task.title} before its deadline — your week is overbooked.`,
        reasoning: "Task could not be scheduled."
      });
    } else {
      // Schedule it
      for (let j = 0; j < neededSlots; j++) {
        slots[startIdx + j] = true;
      }
      taskCompletionSlot.set(task.task_id, startIdx + neededSlots);
      
      if (task.macro_context && task.macro_context !== 'NONE') {
        const cluster = contextClusters[task.macro_context] || task.macro_context;
        lastClusterStartIdx[cluster] = startIdx;
        lastClusterCompletionIdx[cluster] = startIdx + neededSlots;
      }

      const blockStartTime = new Date(weekStartMs + startIdx * MS_PER_15_MIN);
      const blockEndTime = new Date(weekStartMs + (startIdx + neededSlots) * MS_PER_15_MIN);

      result.calendar_blocks.push({
        block_id: crypto.randomUUID(), // Or let DB generate, but we return object here. (Hackathon: crypto.randomUUID is fine if using node 19+ or importing crypto)
        user_id: task.user_id,
        reference_id: task.task_id,
        type_of_block: 'FLUID_TASK',
        start_time: blockStartTime,
        end_time: blockEndTime,
        is_locked: false
      });

      if (outOfIdealEnergy) {
        result.logs.push({
          task_id: task.task_id,
          title: task.title,
          action: `Scheduled ${task.title} outside ideal energy window — deadline pressure`,
          reasoning: "No slots matching required energy level were available before the deadline."
        });
      }
    }
  }

  return result;
}
