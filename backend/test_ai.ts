import { extractTasksFromBrainDump } from './src/services/ai';
import { config } from 'dotenv';
config();

async function run() {
  const text = "Today I need to brainstorm some blog post ideas and also reply to a few Slack messages. Tomorrow I have a dentist appointment from 9am to 10am. Sometime tomorrow I also need to build the new landing page. Oh, and please draft an email to the dentist asking if I need to bring my x-rays.";
  const dt = "2026-06-30T00:50:01+05:30";
  const chrono = "morning";
  const res = await extractTasksFromBrainDump(text, dt, chrono);
  console.log(JSON.stringify(res, null, 2));
}

run().catch(console.error);
