import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';
dotenv.config();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
async function run() {
  try {
    const model = genAI.getGenerativeModel({model: "gemini-1.5-pro-latest"});
    const res = await model.generateContent("hello");
    console.log("Response:", res.response.text());
  } catch(e: any) {
    console.error("Error with gemini-1.5-pro-latest:", e.message);
  }
}
run();
