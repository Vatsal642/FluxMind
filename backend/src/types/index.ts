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

export interface User {
    user_id: string;
    email: string;
    google_refresh_token?: string;
    timezone: string;
    created_at: Date;
}

export interface Task {
    task_id: string;
    user_id: string;
    title: string;
    estimated_minutes: number;
    deadline: Date;
    start_after?: Date;
    energy_required: EnergyLevel;
    is_agentic: boolean;
    agentic_action_type: AgenticActionType;
    agentic_status: AgenticStatus;
    agentic_draft_content?: string;
    business_hours_only?: boolean;
    status: TaskStatus;
    parent_task_id?: string;
    macro_context?: MacroContext;
    created_at: Date;
}

export interface TaskDependency {
    dependency_id: string;
    task_id: string;
    depends_on_task_id: string;
}

export interface CalendarBlock {
    block_id: string;
    user_id: string;
    reference_id: string;
    type_of_block: BlockType;
    start_time: Date;
    end_time: Date;
    is_locked: boolean;
}

export interface HabitAndGoal {
    habit_id: string;
    user_id: string;
    title: string;
    anchor_event?: string;
    target_metric: number;
    current_progress: number;
    target_deadline: Date;
    created_at: Date;
}

export interface MissionLog {
    log_id: string;
    user_id: string;
    action_taken: string;
    reasoning: string;
    related_task_id?: string;
    created_at: Date;
}
