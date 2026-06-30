const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://fluxmind:password@localhost:5432/fluxmind_db' });
const axios = require('axios');

async function seed() {
  const userIdRes = await pool.query('SELECT user_id FROM users LIMIT 1');
  const userId = userIdRes.rows[0].user_id;
  
  const tasks = [
    { title: 'Write the massive Q3 financial report', mins: 60, start: '2026-06-29 05:30:00+05:30', energy: 'HIGH', agentic: false },
    { title: 'Review the Q3 report', mins: 30, start: null, energy: 'MEDIUM', agentic: false },
    { title: 'Brainstorm new app architecture ideas', mins: 60, start: '2026-06-29 05:30:00+05:30', energy: 'HIGH', agentic: false },
    { title: 'Email the marketing team', mins: 30, start: '2026-06-29 05:30:00+05:30', energy: 'MEDIUM', agentic: true },
    { title: 'Organize my desk', mins: 30, start: '2026-06-29 05:30:00+05:30', energy: 'LOW', agentic: false }
  ];

  const dbTasks = [];
  for (const t of tasks) {
    const res = await pool.query(
      `INSERT INTO tasks (user_id, title, estimated_minutes, deadline, start_after, energy_required, is_agentic, agentic_action_type) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [userId, t.title, t.mins, '2026-06-30 05:29:59+05:30', t.start, t.energy, t.agentic, t.agentic ? 'EMAIL_DRAFT' : 'NONE']
    );
    dbTasks.push(res.rows[0]);
  }

  // Add dependency: Review depends on Write
  const writeTask = dbTasks.find(t => t.title.includes('Write'));
  const reviewTask = dbTasks.find(t => t.title.includes('Review'));
  
  await pool.query(
    `INSERT INTO task_dependencies (task_id, depends_on_task_id) VALUES ($1, $2)`,
    [reviewTask.task_id, writeTask.task_id]
  );

  console.log("Tasks inserted. Calling schedule endpoint to trigger scheduler...");
  // We can't easily call runScheduler from outside, so let's just trigger it or run it
  // Wait, runScheduler is not an API endpoint. 
  // Let's just import it? But it's TS. Let's just run it via a quick TS script.
}

seed().then(() => {
    console.log("Done");
    process.exit(0);
}).catch(console.error);
