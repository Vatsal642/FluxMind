"use client";
import React, { useState, useRef } from 'react';
import { useStore } from '@/store';
import { apiFetch } from '@/lib/api';
import { Mic, MicOff, Send, Sparkles, CheckCircle2, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function BrainDumpConsole() {
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [flash, setFlash] = useState<'ok'|'err'|null>(null);
  const [voiceError, setVoiceError] = useState<string|null>(null);
  const recRef = useRef<any>(null);
  const { setTasks, setCalendarBlocks } = useStore();

  const stopRecognition = () => {
    try { recRef.current?.stop(); } catch (e) {}
    setListening(false);
  };

  const toggleVoice = async () => {
    setVoiceError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
    } catch (err) {
      setVoiceError("Microphone access denied. Please allow permissions in your browser.");
      return;
    }

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setVoiceError("Speech Recognition is not supported in this browser. Try Chrome.");
      return;
    }

    if (listening) { 
      stopRecognition();
      return; 
    }
    
    try {
      const r = new SR(); 
      r.continuous = true; 
      r.interimResults = true;
      r.onresult = (e: any) => {
        try {
          if (!e.results) return;
          const transcript = Array.from(e.results).map((x:any) => x[0]?.transcript || '').join('');
          setText(transcript);
        } catch (err) { console.error(err); }
      };
      r.onend = () => {
        try { setListening(false); } catch(err){}
      };
      r.onerror = (e: any) => {
        try {
          if (e.error === 'no-speech' || e.error === 'aborted') {
            stopRecognition();
          } else if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
            setVoiceError("Microphone access denied.");
            stopRecognition();
          } else {
            setVoiceError("Voice input stopped unexpectedly.");
            stopRecognition();
          }
        } catch (err) { console.error(err); }
      };
      
      r.start(); 
      recRef.current = r; 
      setListening(true);
    } catch (err) {
      setVoiceError("Failed to start voice recognition.");
      setListening(false);
    }
  };

  const submit = async () => {
    if (!text.trim() || loading) return;
    if (listening) stopRecognition();
    setLoading(true);
    try {
      const tzOffset = new Date().getTimezoneOffset();
      const absOffset = Math.abs(tzOffset);
      const offsetHours = Math.floor(absOffset / 60).toString().padStart(2, '0');
      const offsetMins = (absOffset % 60).toString().padStart(2, '0');
      const offsetStr = (tzOffset <= 0 ? '+' : '-') + offsetHours + ':' + offsetMins;
      const localIso = new Date(new Date().getTime() - tzOffset * 60000).toISOString().slice(0, -1) + offsetStr;
      const res = await apiFetch('/api/brain-dump', { method:'POST', body: JSON.stringify({ raw_text: text, local_time: localIso }) });
      setTasks(res.tasks ?? []);
      if (res.schedule?.blocks) setCalendarBlocks(res.schedule.blocks);
      setText(''); setFlash('ok'); setTimeout(()=>setFlash(null), 3000);
    } catch { setFlash('err'); setTimeout(()=>setFlash(null), 3000); }
    finally { setLoading(false); }
  };

  return (
    <div className="premium-card p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-indigo-900/30 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
          <Sparkles className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-[15px] font-semibold text-white">Brain Dump</h2>
          <p className="text-[12px] text-white/60">AI extracts tasks & auto-schedules your day</p>
        </div>
        <AnimatePresence>
          {flash === 'ok' && (
            <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="badge badge-success">
              <CheckCircle2 className="w-3 h-3" /> Processed
            </motion.span>
          )}
          {flash === 'err' && (
            <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="badge badge-danger">
              <XCircle className="w-3 h-3" /> Failed
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="relative mb-3">
        {voiceError && (
          <div className="absolute left-3 top-3 right-24 text-red-400 text-[12px] bg-red-950/50 px-2 py-1.5 rounded border border-red-900/50 flex items-center justify-between z-10 shadow-sm">
            <span>{voiceError}</span>
            <button onClick={() => setVoiceError(null)} className="ml-2 hover:opacity-70 p-0.5"><XCircle className="w-3.5 h-3.5" /></button>
          </div>
        )}
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key==='Enter' && (e.metaKey||e.ctrlKey)) submit(); }}
          placeholder="Dump anything... 'Email Sarah re: Q3 by Friday, dentist Monday 9am, finish pitch deck'"
          className="premium-input min-h-[100px] resize-y text-[14px] leading-relaxed"
        />
        {listening && (
          <div className="absolute right-3 top-3 flex items-center gap-1.5 bg-red-950/50 text-red-400 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider animate-pulse border border-red-900/50 z-10">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div> Recording
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={toggleVoice} className={`btn-secondary px-4 py-2 ${listening ? '!text-red-400 !border-red-900/50 !bg-red-950/50' : ''}`}>
            {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            {listening ? 'Stop' : 'Voice'}
          </button>
          <span className="text-[11px] text-white/60 hidden sm:inline-block">⌘+Enter to submit</span>
        </div>
        <button onClick={submit} disabled={!text.trim() || loading} className="btn-primary min-w-[140px]">
          {loading ? (
            <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Processing</>
          ) : (
            <><Send className="w-4 h-4" /> Process Dump</>
          )}
        </button>
      </div>
    </div>
  );
}
