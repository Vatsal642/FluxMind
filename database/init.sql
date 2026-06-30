CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE task_status AS ENUM ('PENDING', 'SCHEDULED', 'COMPLETED', 'MISSED');
CREATE TYPE energy_level AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE block_type AS ENUM ('FIXED_EVENT', 'FLUID_TASK', 'HABIT');
CREATE TYPE agentic_action_type AS ENUM ('EMAIL_DRAFT', 'NONE');
CREATE TYPE agentic_status AS ENUM ('NOT_APPLICABLE', 'DRAFTED', 'SENT', 'REJECTED');

CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    google_refresh_token TEXT,
    timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tasks (
    task_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    estimated_minutes INT NOT NULL DEFAULT 15,
    deadline TIMESTAMP WITH TIME ZONE NOT NULL,
    energy_required energy_level NOT NULL DEFAULT 'MEDIUM',
    is_agentic BOOLEAN NOT NULL DEFAULT FALSE,
    agentic_action_type agentic_action_type NOT NULL DEFAULT 'NONE',
    agentic_status agentic_status NOT NULL DEFAULT 'NOT_APPLICABLE',
    agentic_draft_content TEXT,
    status task_status NOT NULL DEFAULT 'PENDING',
    parent_task_id UUID REFERENCES tasks(task_id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE task_dependencies (
    dependency_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
    depends_on_task_id UUID NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
    UNIQUE (task_id, depends_on_task_id)
);

CREATE TABLE calendar_blocks (
    block_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    reference_id UUID NOT NULL,
    type_of_block block_type NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    is_locked BOOLEAN NOT NULL DEFAULT FALSE
);
-- reference_id is intentionally POLYMORPHIC and has NO foreign key constraint.
-- Do NOT add a REFERENCES clause to it — it must work for both tasks and habits_and_goals.
-- To resolve it: if type_of_block IN ('FIXED_EVENT', 'FLUID_TASK'), reference_id joins to tasks.task_id.
-- If type_of_block = 'HABIT', reference_id joins to habits_and_goals.habit_id.
-- Application code (not the DB) is responsible for joining to the correct table based on type_of_block.

CREATE TABLE habits_and_goals (
    habit_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    anchor_event VARCHAR(100),
    target_metric INT NOT NULL,
    current_progress INT NOT NULL DEFAULT 0,
    target_deadline TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE mission_logs (
    log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    action_taken VARCHAR(255) NOT NULL,
    reasoning TEXT NOT NULL,
    related_task_id UUID REFERENCES tasks(task_id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
