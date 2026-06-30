"use client";
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '@/store';
import { apiFetch } from '@/lib/api';
import { Mail, Send, X, Edit3, SendHorizontal, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function ActionDeck() {
  const drafts = useStore(s=>s.drafts);
  const removeDraft = useStore(s=>s.removeDraft);
  const [edit, setEdit] = useState<{id:string,recipient:string,subject:string,body:string}|null>(null);
  const [sending, setSending] = useState<string|null>(null);

  const approve = async (taskId: string) => {
    setSending(taskId);
    try { await apiFetch(`/api/tasks/${taskId}/draft/approve`,{method:'POST'}); removeDraft(taskId); }
    catch(e){ console.error(e); } finally { setSending(null); }
  };

  const reject = async (taskId: string) => {
    try { await apiFetch(`/api/tasks/${taskId}/draft/reject`,{method:'POST'}); removeDraft(taskId); } catch{}
  };

  const openEdit = async (taskId: string, subject: string, preview: string) => {
    try { const d = await apiFetch(`/api/tasks/${taskId}/draft`); setEdit({id:taskId,recipient:d.draft_recipient||'recipient@example.com',subject:d.draft_subject||subject,body:d.draft_content||preview}); }
    catch { setEdit({id:taskId,recipient:'recipient@example.com',subject,body:preview}); }
  };

  const saveEdit = async () => {
    if(!edit) return;
    try { await apiFetch(`/api/tasks/${edit.id}/draft`,{method:'PATCH',body:JSON.stringify({draft_recipient:edit.recipient,draft_subject:edit.subject,draft_content:edit.body})}); setEdit(null); }
    catch{}
  };

  return (
    <>
      <div className="premium-card p-5 h-full flex flex-col">
        <div className="flex items-center gap-3 mb-5 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-amber-900/30 border border-amber-500/30 flex items-center justify-center text-amber-400 relative">
            <Mail className="w-5 h-5" />
            <AnimatePresence>
              {drafts.length > 0 && (
                <motion.div initial={{scale:0}} animate={{scale:1}} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center border-2 border-white">
                  {drafts.length}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div>
            <h2 className="text-[15px] font-semibold text-white">Action Deck</h2>
            <p className="text-[12px] text-white/60">AI email drafts ready for review</p>
          </div>
        </div>

        {drafts.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 opacity-60">
            <div className="w-16 h-16 rounded-2xl bg-white/5/50 border border-white/10/50 flex items-center justify-center">
              <Mail className="w-7 h-7 text-white0" />
            </div>
            <p className="text-[13px] text-white/60 text-center leading-relaxed">
              No drafts pending.<br />
              AI generates emails automatically <br/>for your agentic tasks.
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto flex flex-col gap-3 pr-1">
            <AnimatePresence>
              {drafts.map(d => (
                <motion.div key={d.task_id} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,scale:0.95}} className="bg-white/5 border border-white/10 rounded-xl p-4 transition-colors hover:bg-white/10 shadow-sm">
                  <div className="mb-3">
                    <p className="text-[13px] font-semibold text-white mb-1 truncate">{d.draft_subject}</p>
                    <p className="text-[12px] text-white/60 line-clamp-2 leading-relaxed">{d.draft_preview}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={()=>approve(d.task_id)} disabled={sending===d.task_id} className="btn-primary flex-1 flex items-center justify-center gap-2 py-1.5 text-[12px]">
                      {sending===d.task_id ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <SendHorizontal className="w-3.5 h-3.5" />}
                      Send
                    </button>
                    <button onClick={()=>openEdit(d.task_id,d.draft_subject,d.draft_preview)} className="btn-secondary py-1.5 px-3">
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={()=>reject(d.task_id)} className="btn-danger py-1.5 px-3">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {edit && (
            <>
              <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm" onClick={()=>setEdit(null)} />
              <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-full max-w-[560px] px-4 pointer-events-none">
                <motion.div initial={{opacity:0,scale:0.95,y:20}} animate={{opacity:1,scale:1,y:0}} exit={{opacity:0,scale:0.95,y:20}} className="premium-card w-full p-6 shadow-2xl pointer-events-auto">
                  <div className="flex justify-between items-center mb-5">
                    <h3 className="font-semibold text-lg text-white flex items-center gap-2">
                      <Edit3 className="w-4 h-4 text-indigo-400" /> Edit Draft
                    </h3>
                    <button onClick={()=>setEdit(null)} className="p-2 hover:bg-white/10 rounded-lg text-white/60 transition-colors"><X className="w-4 h-4" /></button>
                  </div>
                  <input value={edit.recipient} onChange={e=>setEdit({...edit,recipient:e.target.value})} placeholder="To: email@example.com" className="premium-input mb-3 text-[14px]" />
                  <input value={edit.subject} onChange={e=>setEdit({...edit,subject:e.target.value})} placeholder="Subject" className="premium-input mb-4 text-[15px] font-medium" />
                  <textarea value={edit.body} onChange={e=>setEdit({...edit,body:e.target.value})} className="premium-input min-h-[240px] resize-y leading-relaxed mb-6" />
                  <div className="flex justify-end gap-3">
                    <button onClick={()=>setEdit(null)} className="btn-secondary px-5 py-2.5">Cancel</button>
                    <button onClick={saveEdit} className="btn-primary">Save Changes</button>
                  </div>
                </motion.div>
              </div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
