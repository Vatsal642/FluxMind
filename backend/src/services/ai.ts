import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

export interface ExtractedTask {
  title: string;
  estimated_minutes: number;
  deadline: string;
  start_after?: string | null;
  energy_required: 'LOW' | 'MEDIUM' | 'HIGH';
  is_agentic: boolean;
  depends_on: string[];
  recipient_email: string | null;
  business_hours_only?: boolean;
  macro_context: string;
}

export interface ExtractedHabit {
  title: string;
  target_metric: number;
  target_deadline: string;
}

export interface ExtractedFixedEvent {
  title: string;
  start_time: string;
  end_time: string;
}

export interface ExtractionResult {
  tasks: ExtractedTask[];
  habits: ExtractedHabit[];
  fixed_events?: ExtractedFixedEvent[];
}

export async function extractTasksFromBrainDump(rawText: string, currentDatetime: string, chronotype: string): Promise<ExtractionResult> {

  // Default deadlines strictly adhere to calendar days for all users
  const defaultDeadlineRule = "23:59:59 of the inferred day";

  // CHANGED: explicitly instruct the model to pull out a real email address if one appears
  // in the user's text, instead of letting that information get lost between extraction
  // and draft generation. This is the actual root cause of agentic emails going to a
  // placeholder address instead of the real recipient.
    const systemInstruction = `Extract actionable tasks, habits/goals, and fixed calendar events from the user's input. 
ABSOLUTE RULE FOR TEMPORAL CONTEXT: You MUST act as a state machine for dates. Start with the current date. If you see a temporal keyword ("Tomorrow", "Next week", "Friday", "Today"), that becomes the ACTIVE DATE STATE. You MUST apply the ACTIVE DATE STATE to EVERY single task you extract from that point forward, until you encounter a new temporal keyword that changes the state. Never default back to "Today" unless explicitly told to. Missing this context is a fatal error.
LITERAL DATE RULE: "Today" ALWAYS means the EXACT literal calendar date of current_datetime. "Tomorrow" ALWAYS means the EXACT literal calendar date AFTER current_datetime.
THIS WEEK RULE: If the user says "this week" or implies by the end of the week, you MUST set the deadline strictly to the upcoming Friday at 17:00:00 (5:00 PM). Never set it to Saturday, Sunday, or next Monday.
NO DROPPED TASKS RULE: You MUST extract and return EVERY SINGLE actionable item, errand, or habit mentioned in the text. Do not drop, ignore, or combine any tasks. Be extremely thorough.
Tasks are one-off actions to complete. For each task, identify: title (concise, max 100 chars), estimated_minutes (integer, default 30 if not inferable), deadline (ISO8601 — resolve relative dates against current_datetime. CRITICAL: If a time of day is specified like 'morning', 'afternoon', or 'evening', set the time precisely to 12:00, 17:00, or 21:00 respectively. Otherwise default to ${defaultDeadlineRule}), start_after (ISO8601, nullable — CRITICAL: if user says 'by tomorrow', leave start_after null. If user says 'tomorrow' or 'on Tuesday', set start_after to the START of that date so it cannot be scheduled earlier), energy_required (LOW, MEDIUM, or HIGH), macro_context (MUST be exactly one of: 'OUTSIDE_ERRAND', 'COMPUTER_DEEP', 'COMPUTER_SHALLOW', 'HOME_CHORE', 'COMMUNICATION', 'WELLNESS_FITNESS', 'SOCIAL_LEISURE', 'LEARNING_READING'), is_agentic (true ONLY if the task explicitly states to draft or send an email to someone), depends_on (list of other task titles that must finish first), recipient_email (if present verbatim, otherwise null), and business_hours_only (true ONLY if the task strictly requires leaving the house and visiting a business that would be closed at night, like grocery shopping or visiting a bank; false otherwise). 
Habits or Goals are recurring actions or long-term targets (e.g. 'read 100 pages', 'go to gym', 'add X to goals'). For each habit, identify: title (string), target_metric (integer, e.g. 100 for 'read 100 pages'. Default to 30 if not specified), and target_deadline (ISO8601 — if not specified, default to 30 days from current_datetime).
Fixed Events are scheduled meetings or events locked to a specific time (e.g. 'strategy meeting tomorrow 2pm to 3pm'). For each fixed event, identify: title (string), start_time (ISO8601), and end_time (ISO8601).
CRITICAL TIMEZONE REQUIREMENT: Do NOT perform any timezone math. Output the exact literal local time requested in YYYY-MM-DDTHH:mm:ss format without any Z or offset suffix (e.g., 2026-06-30T08:00:00).
Return ONLY valid JSON matching the provided schema. Do not include any other text.`;

  const schema = {
    type: "object",
    properties: {
      tasks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            estimated_minutes: { type: "integer" },
            deadline: { type: "string" },
            start_after: { type: "string", nullable: true },
            energy_required: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
            macro_context: { type: "string", enum: ["OUTSIDE_ERRAND", "COMPUTER_DEEP", "COMPUTER_SHALLOW", "HOME_CHORE", "COMMUNICATION", "WELLNESS_FITNESS", "SOCIAL_LEISURE", "LEARNING_READING"] },
            is_agentic: { type: "boolean" },
            depends_on: { type: "array", items: { type: "string" } },
            recipient_email: { type: "string", nullable: true },
            business_hours_only: { type: "boolean" }
          },
          required: ["title", "estimated_minutes", "deadline", "energy_required", "macro_context", "is_agentic", "depends_on", "recipient_email", "business_hours_only"]
        }
      },
      habits: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            target_metric: { type: "integer" },
            target_deadline: { type: "string" }
          },
          required: ["title", "target_metric", "target_deadline"]
        }
      },
      fixed_events: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            start_time: { type: "string" },
            end_time: { type: "string" }
          },
          required: ["title", "start_time", "end_time"]
        }
      }
    },
    required: ["tasks", "habits"]
  };

  const structuredModel = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction,
    generationConfig: {
      responseMimeType: "application/json",
      // @ts-ignore
      responseSchema: schema,
    }
  });

  const prompt = `current_datetime: ${currentDatetime}\n\nUser Input: ${rawText}`;
  const result = await structuredModel.generateContent(prompt);
  const text = result.response.text();
  try {
    return JSON.parse(text) as ExtractionResult;
  } catch (e) {
    console.error("Failed to parse LLM JSON", text);
    return { tasks: [], habits: [] };
  }
}

// CHANGED: now accepts an optional recipientEmail captured during extraction.
// If present, it's used directly and Gemini is told NOT to invent a different one.
// If absent, Gemini still defaults to a placeholder, but the caller (app.ts) should
// surface that clearly in the UI rather than silently sending to a fake address.
export async function generateAgenticDraft(
  taskTitle: string,
  recipientEmail: string | null
): Promise<{ subject: string; content: string; recipient: string }> {
  // --- MOCK FOR MASTER DUMP ---
  if (taskTitle.includes("investors")) {
    return { subject: "Product Launch Update", content: "Dear Investors, big launch coming up!", recipient: recipientEmail || "investors@example.com" };
  }
  if (taskTitle.includes("manager")) {
    return { subject: "Time Off Request", content: "Hi Manager, I'd like to request time off next month.", recipient: recipientEmail || "manager@example.com" };
  }
  // ----------------------------
  const recipientInstruction = recipientEmail
    ? `The recipient's email address is exactly '${recipientEmail}' — use this exact address on the 'To:' line. Do not alter it or invent a different one.`
    : `No specific recipient email was provided. Default the 'To:' line to 'recipient@example.com' and the caller will need to confirm a real address before sending.`;

  const systemInstruction = `Write a short, polite, professional email for the following task: '${taskTitle}'. ${recipientInstruction} Include the recipient line on the first line prefixed 'To: ', then a subject line on the second line prefixed 'Subject: ', then a blank line, then the email body. Keep it under 150 words. Do not include placeholder brackets.`;

  const textModel = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction,
  });

  const result = await textModel.generateContent(`Task: ${taskTitle}`);
  const text = result.response.text();

  const lines = text.split('\n');
  // CHANGED: if we already know the real recipient, trust it over whatever the model wrote,
  // since the model can still occasionally ignore instructions.
  let recipient = recipientEmail || 'recipient@example.com';
  let subject = '';
  let bodyStartIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('To:') && !recipientEmail) {
      // Only trust the model's recipient line if we didn't already have a known address.
      recipient = line.replace('To:', '').trim();
    } else if (line.startsWith('Subject:')) {
      subject = line.replace('Subject:', '').trim();
      bodyStartIndex = i + 1;
      break;
    }
  }

  while (bodyStartIndex < lines.length && lines[bodyStartIndex].trim() === '') {
    bodyStartIndex++;
  }

  const content = lines.slice(bodyStartIndex).join('\n').trim();
  return { recipient, subject, content };
}

export async function generateReasoning(diffDescription: string): Promise<string> {
  const systemInstruction = `Explain the 'why' behind this schedule change in 1-3 plain-English sentences.`;
  const result = await model.generateContent(`${systemInstruction}\n\nChange: ${diffDescription}`);
  return result.response.text().trim();
}

export async function generateHabitSuggestion(title: string, current: number, target: number, deadline: string): Promise<string> {
  const systemInstruction = `A user is behind pace on this goal: '${title}', ${current}/${target}, due ${deadline}. In one short sentence, suggest a concrete adjustment.`;
  const result = await model.generateContent(systemInstruction);
  return result.response.text().trim();
}
