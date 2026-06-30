# FluxMind 🧠⚡️

FluxMind is an AI-powered life engine designed for deep thinkers, ADHD minds, and power users who need their chaotic thoughts instantly structured into actionable, chronologically sound agendas.

## The Problem
For many people, tracking tasks involves opening a todo app and manually assigning dates, times, and priorities. When you are overwhelmed or having a "brain dump" moment, this friction prevents tasks from ever being recorded. 

## The Solution
FluxMind allows you to literally "dump" a chaotic paragraph of thoughts. Our custom AI engine (powered by Google Gemini) automatically extracts every task, cross-references it with your personal Chronotype (e.g., Night Owl vs Morning Lark), and builds a perfectly optimized daily agenda.

It doesn't just list tasks—it schedules heavy deep-work tasks during your peak energy hours, and light errands during your dips. 

## Tech Stack
- **Frontend**: Next.js, React, Vanilla CSS (Glassmorphism & Micro-animations)
- **Backend**: Node.js, Express, TypeScript
- **Database**: PostgreSQL (Cloud SQL)
- **AI Integration**: Google Gemini 2.5 Flash
- **Infrastructure**: Google Cloud Run & Google Cloud SQL

## Features
- **Unstructured Brain Dumps**: Just type whatever is on your mind. The AI parses it flawlessly.
- **Chronotype Scheduling**: The engine mathematically schedules tasks based on human energy curves (Night Owl vs Morning Lark schedules).
- **Fluid Timeline UI**: A beautiful, Apple-esque glassmorphic timeline that visually maps out your day.
- **Micro Focus HUD**: A dedicated "now playing" mode for the single task you are currently working on.

## Running Locally

1. **Clone the repo**
   ```bash
   git clone https://github.com/Vatsal642/FluxMind.git
   cd FluxMind
   ```

2. **Backend Setup**
   ```bash
   cd backend
   npm install
   npm run dev
   ```

3. **Frontend Setup**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

## Hackathon Deployment
This project is fully containerized with Docker and deployed entirely on **Google Cloud Platform (GCP)** using Cloud SQL and Cloud Run.
