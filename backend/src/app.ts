import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { query, pool } from './db';
import { extractTasksFromBrainDump, generateAgenticDraft, generateReasoning, generateHabitSuggestion } from './services/ai';
import { getAuthUrl, getTokens, getUserInfo, sendEmail } from './services/google';
import { computeSchedule, FixedEvent, FluidTask } from './scheduler';
import { Task, CalendarBlock, TaskDependency } from './types';

dotenv.config();

const app = express();
const httpServer = createServer(app);

const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

app.use(cors({
  origin: frontendUrl,
  credentials: true,
}));
app.use(express.json());

const io = new Server(httpServer, {
  cors: {
    origin: frontendUrl,
    credentials: true,
  },
});

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('unauthorized'));
  try {
    const decoded = jwt.verify(token, process.env.SESSION_SECRET || 'secret') as any;
    socket.data.user_id = decoded.user_id;
    next();
  } catch (err) {
    next(new Error('unauthorized'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.data.user_id;
  socket.join(`user:${userId}`);
});

// Auth Middleware
const requireAuth = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'session_expired' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.SESSION_SECRET || 'secret');
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'session_expired' });
  }
};

// 4.1 GET /api/auth/google - initiates OAuth flow
app.get('/api/auth/google', (req: any, res: any) => {
  res.redirect(getAuthUrl());
});

app.get('/api/auth/google/callback', async (req, res) => {
  const code = req.query.code as string;
  try {
    const tokens = await getTokens(code);
    const userInfo = await getUserInfo(tokens.access_token!);
    
    // Upsert user
    const userRes = await query(
      `INSERT INTO users (email, google_refresh_token, timezone) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (email) DO UPDATE SET google_refresh_token = EXCLUDED.google_refresh_token 
       RETURNING user_id, email`,
      [userInfo.email, tokens.refresh_token, 'UTC']
    );
    const user = userRes.rows[0];

    const session_token = jwt.sign(
      { user_id: user.user_id, email: user.email },
      process.env.SESSION_SECRET || 'secret',
      { expiresIn: '7d' }
    );

    // Set cookie and redirect
    res.cookie('session_token', session_token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.redirect(`${frontendUrl}?token=${session_token}`);
  } catch (err) {
    res.status(500).json({ error: 'auth_failed' });
  }
});

// Helper for scheduling
export async function runScheduler(userId: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Obtain an exclusive transaction-level lock for this user to prevent race conditions
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [userId]);

    // Fetch fixed events, fluid tasks, dependencies
    const fixedRes = await client.query(`SELECT * FROM calendar_blocks WHERE user_id = $1 AND (type_of_block = 'FIXED_EVENT' OR is_locked = true)`, [userId]);
    const fluidTasksRes = await client.query(`SELECT * FROM tasks WHERE user_id = $1 AND status = 'PENDING'`, [userId]);
    const depsRes = await client.query(`
      SELECT td.* FROM task_dependencies td 
      JOIN tasks t ON t.task_id = td.task_id 
      WHERE t.user_id = $1`, [userId]);

    // Create weekStart (today 00:00)
    const now = new Date();
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const userRes = await client.query(`SELECT chronotype FROM users WHERE user_id = $1`, [userId]);
    const chronotype = userRes.rows.length > 0 ? userRes.rows[0].chronotype : 'morning';

    const result = computeSchedule(
      fixedRes.rows as FixedEvent[],
      fluidTasksRes.rows as FluidTask[],
      depsRes.rows as TaskDependency[],
      weekStart,
      chronotype
    );

    // Sync to DB 
    await client.query(`DELETE FROM calendar_blocks WHERE user_id = $1 AND type_of_block = 'FLUID_TASK' AND is_locked = false`, [userId]);
    
    console.log(`[Scheduler] Generated ${result.calendar_blocks.length} blocks to insert.`);
    const changed_blocks = [];
    const fluidBlocksToInsert = result.calendar_blocks.filter(b => b.type_of_block === 'FLUID_TASK' && !b.is_locked);
    console.log(`[Scheduler] ${fluidBlocksToInsert.length} fluid blocks to insert.`);

    for (const block of fluidBlocksToInsert) {
      const bRes = await client.query(
        `INSERT INTO calendar_blocks (user_id, reference_id, type_of_block, start_time, end_time, is_locked) 
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING block_id`,
        [block.user_id, block.reference_id, block.type_of_block, block.start_time, block.end_time, block.is_locked]
      );
      changed_blocks.push({
        block_id: bRes.rows[0].block_id,
        reference_id: block.reference_id,
        action: 'CREATED',
        start_time: block.start_time,
        end_time: block.end_time,
        task_title: (fluidTasksRes.rows.find((t: any) => t.task_id === block.reference_id) as any)?.title,
        task_macro_context: (fluidTasksRes.rows.find((t: any) => t.task_id === block.reference_id) as any)?.macro_context
      });
    }

    // Logs
    for (const log of result.logs) {
      const lRes = await client.query(
        `INSERT INTO mission_logs (user_id, action_taken, reasoning, related_task_id) VALUES ($1, $2, $3, $4) RETURNING *`,
        [userId, log.action, log.reasoning, log.task_id]
      );
      io.to(`user:${userId}`).emit('mission_log:new', lRes.rows[0]);
    }

    // Fetch ALL blocks (fluid + fixed) to send to frontend
    const allBlocksRes = await client.query(`
      SELECT cb.*, t.title as task_title, t.macro_context as task_macro_context 
      FROM calendar_blocks cb 
      LEFT JOIN tasks t ON cb.reference_id = t.task_id 
      WHERE cb.user_id = $1`, [userId]);

    await client.query('COMMIT');

    io.to(`user:${userId}`).emit('schedule:update', { 
      changed_blocks: [],
      all_blocks: allBlocksRes.rows,
      full_replacement: true 
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Concurrency error in runScheduler:', error);
  } finally {
    client.release();
  }
}


function cleanDate(d: string | null | undefined, localTime?: string): string | null {
  if (!d) return null;
  const match = d.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?/);
  if (match) {
    let str = match[0];
    if (localTime) {
       const tzMatch = localTime.match(/([+-]\d{2}:\d{2})$/);
       if (tzMatch) {
         const userTz = tzMatch[1];
         if (str.endsWith('Z')) str = str.replace('Z', userTz);
         else if (!str.match(/(Z|[+-]\d{2}:\d{2})$/)) str += userTz;
       }
    }
    return str;
  }
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null : dt.toISOString();
}

// 4.2 POST /api/brain-dump
app.post('/api/brain-dump', requireAuth, async (req: any, res: any) => {
  const { raw_text, local_time } = req.body;
  const userId = req.user.user_id;
  const currentDatetime = cleanDate(local_time) || new Date().toISOString();
  const userRes = await query('SELECT chronotype FROM users WHERE user_id = $1', [userId]);
  const chronotype = userRes.rows[0]?.chronotype || 'MORNING_BIRD';

  let extracted;
  try {
    extracted = await extractTasksFromBrainDump(raw_text, currentDatetime, chronotype);
  } catch (error: any) {
    console.error("Extraction error:", error.message);
    if (error.status === 429 || error.message?.includes('429')) {
      return res.status(429).json({ error: 'quota_exceeded', message: 'Gemini API daily quota exceeded. Please provide a different API key from a different Google Cloud project, or try again tomorrow.' });
    }
    return res.status(500).json({ error: 'api_error', message: 'Failed to communicate with Gemini API.' });
  }

  if ((!extracted.tasks || extracted.tasks.length === 0) && (!extracted.habits || extracted.habits.length === 0) && (!extracted.fixed_events || extracted.fixed_events.length === 0)) {
    return res.status(422).json({ error: 'extraction_failed', message: 'Could not extract any tasks, habits, or fixed events from that input.' });
  }

  const responseTasks = [];
  const responseHabits = [];
  
  for (const t of extracted.tasks || []) {
    const actionType = t.is_agentic ? 'EMAIL_DRAFT' : 'NONE';
    const insRes = await query(
      `INSERT INTO tasks (user_id, title, estimated_minutes, deadline, start_after, energy_required, is_agentic, agentic_action_type, business_hours_only, macro_context) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [userId, t.title, t.estimated_minutes, cleanDate(t.deadline, local_time), cleanDate(t.start_after, local_time), t.energy_required, t.is_agentic, actionType, t.business_hours_only || false, t.macro_context]
    );
    const dbTask = insRes.rows[0];
    responseTasks.push({ ...t, temp_id: dbTask.task_id });

    if (t.is_agentic) {
      // Async generate draft
      generateAgenticDraft(t.title, t.recipient_email || null).then(async (draft) => {
        await query(
          `UPDATE tasks SET agentic_status = 'DRAFTED', agentic_draft_content = $1 WHERE task_id = $2`,
          [`To: ${draft.recipient}\nSubject: ${draft.subject}\n\n${draft.content}`, dbTask.task_id]
        );
        const lRes = await query(
          `INSERT INTO mission_logs (user_id, action_taken, reasoning, related_task_id) VALUES ($1, $2, $3, $4) RETURNING *`,
          [userId, `Drafted email for: ${t.title}`, `Generated draft based on brain dump.`, dbTask.task_id]
        );
        io.to(`user:${userId}`).emit('mission_log:new', lRes.rows[0]);
        io.to(`user:${userId}`).emit('draft:ready', {
          task_id: dbTask.task_id,
          agentic_action_type: 'EMAIL_DRAFT',
          draft_subject: draft.subject,
          draft_preview: draft.content.substring(0, 100)
        });
      }).catch(err => {
        console.error("Agentic draft failed:", err.message);
      });
    }
  }

  for (const h of extracted.habits || []) {
    const insRes = await query(
      `INSERT INTO habits_and_goals (user_id, title, anchor_event, target_metric, target_deadline) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, h.title, null, h.target_metric, cleanDate(h.target_deadline, local_time)]
    );
    responseHabits.push(insRes.rows[0]);
  }

  for (const ev of extracted.fixed_events || []) {
    // 1. Insert into tasks so it has a reference_id
    const durMins = Math.floor((new Date(cleanDate(ev.end_time, local_time)!).getTime() - new Date(cleanDate(ev.start_time, local_time)!).getTime()) / 60000);
    const insRes = await query(
      `INSERT INTO tasks (user_id, title, estimated_minutes, deadline, start_after, energy_required, is_agentic, agentic_action_type, status) 
       VALUES ($1, $2, $3, $4, $5, $6, false, 'NONE', 'SCHEDULED') RETURNING *`,
      [userId, ev.title, durMins > 0 ? durMins : 30, cleanDate(ev.end_time, local_time), cleanDate(ev.start_time, local_time), 'MEDIUM']
    );
    const dbTask = insRes.rows[0];
    
    // 2. Insert into calendar_blocks
    await query(
      `INSERT INTO calendar_blocks (user_id, reference_id, type_of_block, start_time, end_time, is_locked) 
       VALUES ($1, $2, 'FIXED_EVENT', $3, $4, true)`,
      [userId, dbTask.task_id, cleanDate(ev.start_time, local_time), cleanDate(ev.end_time, local_time)]
    );
  }

  // Handle dependencies
  for (const t of responseTasks) {
    if (t.depends_on && t.depends_on.length > 0) {
      for (const depTitle of t.depends_on) {
        // Find the matching task in the newly inserted tasks
        const depTask = responseTasks.find(rt => rt.title.toLowerCase() === depTitle.toLowerCase());
        if (depTask) {
          await query(
            `INSERT INTO task_dependencies (task_id, depends_on_task_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [t.temp_id, depTask.temp_id]
          );
        }
      }
    }
  }
  // Re-run scheduler for the user, since we have new tasks!
  await runScheduler(userId);

  // Fetch ALL blocks (fluid + fixed) to send to frontend to ensure perfect sync
  const allBlocksRes = await query(`
    SELECT cb.*, t.title as task_title, t.macro_context as task_macro_context 
    FROM calendar_blocks cb 
    LEFT JOIN tasks t ON cb.reference_id = t.task_id 
    WHERE cb.user_id = $1`, [userId]);

  io.to(`user:${userId}`).emit('schedule:update', { 
    changed_blocks: [], 
    all_blocks: allBlocksRes.rows,
    full_replacement: true 
  });

  res.json({ tasks: responseTasks, habits: responseHabits });
});

// 4.3 GET /api/schedule
app.get('/api/schedule', requireAuth, async (req: any, res: any) => {
  const userId = req.user.user_id;
  // Ignoring week_start param for simplicity, fetching all
  const blocksRes = await query(`
    SELECT cb.*, t.title as task_title, t.macro_context as task_macro_context 
    FROM calendar_blocks cb 
    LEFT JOIN tasks t ON cb.reference_id = t.task_id 
    WHERE cb.user_id = $1`, [userId]);
  res.json({ week_start: req.query.week_start || new Date().toISOString(), blocks: blocksRes.rows });
});

// 4.4 GET /api/tasks
app.get('/api/tasks', requireAuth, async (req: any, res: any) => {
  const userId = req.user.user_id;
  const status = req.query.status;
  let text = `SELECT * FROM tasks WHERE user_id = $1`;
  const params: any[] = [userId];
  if (status) {
    text += ` AND status = $2`;
    params.push(status);
  }
  const tasksRes = await query(text, params);
  res.json(tasksRes.rows);
});

// 4.5 POST /api/tasks/:taskId/start
app.post('/api/tasks/:taskId/start', requireAuth, async (req: any, res: any) => {
  const taskRes = await query(`SELECT task_id, title, estimated_minutes FROM tasks WHERE task_id = $1 AND user_id = $2`, [req.params.taskId, req.user.user_id]);
  res.json(taskRes.rows[0]);
});

// 4.6 POST /api/tasks/:taskId/complete
app.post('/api/tasks/:taskId/complete', requireAuth, async (req: any, res: any) => {
  const { taskId } = req.params;
  const userId = req.user.user_id;
  await query(`UPDATE tasks SET status = 'COMPLETED' WHERE task_id = $1 AND user_id = $2`, [taskId, userId]);
  
  res.json({ task_id: taskId, status: 'COMPLETED' });
  await runScheduler(userId);
});

// 4.7 GET /api/tasks/:taskId/draft
app.get('/api/tasks/:taskId/draft', requireAuth, async (req: any, res: any) => {
  const tRes = await query(`SELECT task_id, agentic_action_type, agentic_status, agentic_draft_content FROM tasks WHERE task_id = $1`, [req.params.taskId]);
  const t = tRes.rows[0];
  const parts = t.agentic_draft_content?.split('\n\n') || [];
  const headerLines = parts[0]?.split('\n') || [];
  const draft_recipient = headerLines.find((l: string) => l.startsWith('To: '))?.replace('To: ', '') || '';
  const draft_subject = headerLines.find((l: string) => l.startsWith('Subject: '))?.replace('Subject: ', '') || '';
  const draft_content = parts.slice(1).join('\n\n') || '';
  res.json({ task_id: t.task_id, agentic_action_type: t.agentic_action_type, agentic_status: t.agentic_status, draft_recipient, draft_content, draft_subject });
});

// 4.8 PATCH /api/tasks/:taskId/draft
app.patch('/api/tasks/:taskId/draft', requireAuth, async (req: any, res: any) => {
  const { draft_recipient, draft_content, draft_subject } = req.body;
  const content = `To: ${draft_recipient}\nSubject: ${draft_subject}\n\n${draft_content}`;
  await query(`UPDATE tasks SET agentic_draft_content = $1 WHERE task_id = $2`, [content, req.params.taskId]);
  res.json({ task_id: req.params.taskId, draft_recipient, draft_content, draft_subject });
});

// 4.9 POST /api/tasks/:taskId/draft/approve
app.post('/api/tasks/:taskId/draft/approve', requireAuth, async (req: any, res: any) => {
  try {
    const tRes = await query(`SELECT * FROM tasks WHERE task_id = $1`, [req.params.taskId]);
    const t = tRes.rows[0];
    const uRes = await query(`SELECT google_refresh_token FROM users WHERE user_id = $1`, [req.user.user_id]);
    const rt = uRes.rows[0].google_refresh_token;

    const parts = t.agentic_draft_content?.split('\n\n') || [];
    const headerLines = parts[0]?.split('\n') || [];
    const draft_recipient = headerLines.find((l: string) => l.startsWith('To: '))?.replace('To: ', '') || req.user.email;
    const draft_subject = headerLines.find((l: string) => l.startsWith('Subject: '))?.replace('Subject: ', '') || '';
    const draft_content = parts.slice(1).join('\n\n') || '';

    // Guard: if the recipient is still the unresolved placeholder, refuse to send and
    // tell the user clearly instead of letting Gmail silently reject it (or worse,
    // letting it actually send to a fake address).
    if (!draft_recipient || draft_recipient === 'recipient@example.com') {
      return res.status(422).json({
        error: 'no_recipient',
        message: 'No recipient email was found for this draft. Edit the draft and add a real "To:" address before sending.'
      });
    }

    // Send email to the recipient parsed from the draft content
    await sendEmail(rt, draft_recipient, draft_subject, draft_content);
    await query(`UPDATE tasks SET agentic_status = 'SENT' WHERE task_id = $1`, [req.params.taskId]);
    res.json({ task_id: req.params.taskId, agentic_status: 'SENT', sent_at: new Date().toISOString() });
  } catch (e: any) {
    res.status(502).json({ error: 'send_failed', message: e.message });
  }
});

// 4.10 POST /api/tasks/:taskId/draft/reject
app.post('/api/tasks/:taskId/draft/reject', requireAuth, async (req: any, res: any) => {
  await query(`UPDATE tasks SET agentic_status = 'REJECTED' WHERE task_id = $1`, [req.params.taskId]);
  res.json({ success: true });
});

// 4.11 GET /api/habits
app.get('/api/habits', requireAuth, async (req: any, res: any) => {
  const hRes = await query(`SELECT * FROM habits_and_goals WHERE user_id = $1`, [req.user.user_id]);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const todayBlocksRes = await query(
    `SELECT count(*) FROM calendar_blocks WHERE user_id = $1 AND start_time >= $2 AND start_time <= $3 AND type_of_block != 'HABIT'`,
    [req.user.user_id, startOfToday.toISOString(), endOfToday.toISOString()]
  );
  const todayBlockCount = parseInt(todayBlocksRes.rows[0].count, 10);
  const is_hectic = todayBlockCount >= 4;
  const hectic_reason = is_hectic ? `You have ${todayBlockCount} tasks/events scheduled today.` : null;

  const habits = hRes.rows.map(h => {
    const elapsedMs = Date.now() - new Date(h.created_at).getTime();
    const totalMs = new Date(h.target_deadline).getTime() - new Date(h.created_at).getTime();
    const expected = h.target_metric * (elapsedMs / totalMs);
    let pace_status = 'BEHIND';
    if (h.current_progress >= expected * 1.1) pace_status = 'AHEAD';
    else if (h.current_progress >= expected * 0.9) pace_status = 'ON_TRACK';

    const totalDays = Math.max(1, Math.ceil(totalMs / (1000 * 60 * 60 * 24)));
    let base_today_target = Math.ceil(h.target_metric / totalDays);
    let today_target = base_today_target;
    
    const todayStr = startOfToday.toISOString().split('T')[0];
    const overrideDate = h.daily_target_override_date ? new Date(h.daily_target_override_date).toISOString().split('T')[0] : null;
    if (overrideDate === todayStr && h.daily_target_override !== null) {
      today_target = h.daily_target_override;
    }

    return { ...h, pace_status, today_target, is_hectic, hectic_reason };
  });
  res.json(habits);
});

// 4.12 POST /api/habits
app.post('/api/habits', requireAuth, async (req: any, res: any) => {
  const { title, anchor_event, target_metric, target_deadline } = req.body;
  const hRes = await query(
    `INSERT INTO habits_and_goals (user_id, title, anchor_event, target_metric, target_deadline) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [req.user.user_id, title, anchor_event || null, target_metric, target_deadline]
  );
  
  if (anchor_event) {
     // Create a calendar block for each day
     const start = new Date();
     const end = new Date(target_deadline);
     for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dStart = new Date(d); dStart.setHours(8,0,0,0);
        const dEnd = new Date(d); dEnd.setHours(8,15,0,0);
        await query(
          `INSERT INTO calendar_blocks (user_id, reference_id, type_of_block, start_time, end_time, is_locked) VALUES ($1, $2, $3, $4, $5, true)`,
          [req.user.user_id, hRes.rows[0].habit_id, 'HABIT', dStart.toISOString(), dEnd.toISOString()]
        );
     }
  }
  res.status(201).json({ ...hRes.rows[0], pace_status: 'ON_TRACK' });
});

// 4.13 PATCH /api/habits/:habitId/progress
app.patch('/api/habits/:habitId/progress', requireAuth, async (req: any, res: any) => {
  const { habitId } = req.params;
  const { increment } = req.body;
  const hRes = await query(
    `UPDATE habits_and_goals SET current_progress = current_progress + $1 WHERE habit_id = $2 RETURNING *`,
    [increment, habitId]
  );
  const h = hRes.rows[0];
  const elapsed = Date.now() - new Date(h.created_at).getTime();
  const total = new Date(h.target_deadline).getTime() - new Date(h.created_at).getTime();
  const expected = h.target_metric * (elapsed / total);
  let pace_status = 'BEHIND';
  if (h.current_progress >= expected * 1.1) pace_status = 'AHEAD';
  else if (h.current_progress >= expected * 0.9) pace_status = 'ON_TRACK';

  if (pace_status === 'BEHIND') {
    generateHabitSuggestion(h.title, h.current_progress, h.target_metric, h.target_deadline.toISOString()).then(async (suggestion) => {
      const lRes = await query(
        `INSERT INTO mission_logs (user_id, action_taken, reasoning) VALUES ($1, $2, $3) RETURNING *`,
        [req.user.user_id, `Fell behind pace on: ${h.title}`, suggestion]
      );
      io.to(`user:${req.user.user_id}`).emit('habit:behind_pace', {
        habit_id: h.habit_id, title: h.title, current_progress: h.current_progress, target_metric: h.target_metric, suggested_action: suggestion
      });
      io.to(`user:${req.user.user_id}`).emit('mission_log:new', lRes.rows[0]);
    });
  }
  res.json({ habit_id: h.habit_id, current_progress: h.current_progress, target_metric: h.target_metric, pace_status });
});

app.patch('/api/habits/:habitId/today-target', requireAuth, async (req: any, res: any) => {
  const { habitId } = req.params;
  const { target } = req.body;
  const today = new Date().toISOString().split('T')[0];
  const hRes = await query(
    `UPDATE habits_and_goals SET daily_target_override = $1, daily_target_override_date = $2 WHERE habit_id = $3 AND user_id = $4 RETURNING *`,
    [target, today, habitId, req.user.user_id]
  );
  res.json(hRes.rows[0]);
});

app.patch('/api/habits/:habitId/total-target', requireAuth, async (req: any, res: any) => {
  const { habitId } = req.params;
  const { target } = req.body;
  const hRes = await query(
    `UPDATE habits_and_goals SET target_metric = $1 WHERE habit_id = $2 AND user_id = $3 RETURNING *`,
    [target, habitId, req.user.user_id]
  );
  res.json(hRes.rows[0]);
});

app.delete('/api/habits/:habitId', requireAuth, async (req: any, res: any) => {
  const { habitId } = req.params;
  
  // First, we should remove any calendar blocks tied to this habit
  await query(`DELETE FROM calendar_blocks WHERE reference_id = $1 AND user_id = $2`, [habitId, req.user.user_id]);
  
  // Then delete the habit itself
  await query(`DELETE FROM habits_and_goals WHERE habit_id = $1 AND user_id = $2`, [habitId, req.user.user_id]);
  
  res.json({ success: true });
});

// 4.14 GET /api/mission-logs
app.get('/api/mission-logs', requireAuth, async (req: any, res: any) => {
  const lRes = await query(`SELECT * FROM mission_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`, [req.user.user_id, req.query.limit || 50]);
  res.json(lRes.rows);
});

// 4.15 GET /api/users/me
app.get('/api/users/me', requireAuth, async (req: any, res: any) => {
  const userRes = await query(`SELECT chronotype, email FROM users WHERE user_id = $1`, [req.user.user_id]);
  if (userRes.rows.length === 0) return res.status(404).json({error: 'user_not_found'});
  res.json(userRes.rows[0]);
});

// 4.16 PUT /api/users/me/chronotype
app.put('/api/users/me/chronotype', requireAuth, async (req: any, res: any) => {
  const { chronotype } = req.body;
  if (chronotype !== 'morning' && chronotype !== 'night') return res.status(400).json({error: 'invalid_chronotype'});
  await query(`UPDATE users SET chronotype = $1 WHERE user_id = $2`, [chronotype, req.user.user_id]);
  
  // Dynamically recalculate the entire schedule with the new chronotype!
  await runScheduler(req.user.user_id);
  
  res.json({ chronotype });
});

// 4.17 PUT /api/blocks/:blockId/lock
app.put('/api/blocks/:blockId/lock', requireAuth, async (req: any, res: any) => {
  const { start_time, end_time } = req.body;
  const blockId = req.params.blockId;
  const userId = req.user.user_id;

  try {
    const bRes = await query(`SELECT * FROM calendar_blocks WHERE block_id = $1 AND user_id = $2`, [blockId, userId]);
    if (bRes.rows.length === 0) return res.status(404).json({error: 'not_found'});

    await query(`
      UPDATE calendar_blocks 
      SET start_time = $1, end_time = $2, is_locked = true 
      WHERE block_id = $3
    `, [start_time, end_time, blockId]);

    await runScheduler(userId);

    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({error: e.message});
  }
});

// Missed tasks cron job
setInterval(async () => {
  try {
    const res = await query(`
      UPDATE tasks 
      SET status = 'MISSED' 
      WHERE deadline < NOW() AND status NOT IN ('COMPLETED', 'MISSED') 
      RETURNING *
    `);
    for (const row of res.rows) {
      const lRes = await query(
        `INSERT INTO mission_logs (user_id, action_taken, reasoning, related_task_id) VALUES ($1, $2, $3, $4) RETURNING *`,
        [row.user_id, `Missed deadline: ${row.title}`, `This task's deadline passed before it was marked complete.`, row.task_id]
      );
      io.to(`user:${row.user_id}`).emit('mission_log:new', lRes.rows[0]);
    }
  } catch (e: any) {
    console.error("Cron Error", e);
  }
}, 5 * 60 * 1000);

export { httpServer };
