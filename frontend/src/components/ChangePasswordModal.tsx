import { useState, type FormEvent, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { authFetch } from '../utils/api';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ChangePasswordModal({ open, onClose }: Props) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (open) { setCurrent(''); setNext(''); setConfirm(''); setError(''); setSuccess(false); }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (next.length < 6) { setError('새 비밀번호는 6자 이상이어야 합니다'); return; }
    if (next !== confirm) { setError('새 비밀번호가 일치하지 않습니다'); return; }
    setLoading(true);
    try {
      const res = await authFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || '변경 실패');
      }
      setSuccess(true);
      setTimeout(() => onClose(), 1400);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '변경 실패');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full px-4 py-3 rounded-xl text-sm text-white placeholder-white/20 outline-none transition-all";
  const inputStyle = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' };
  const inputFocus = (e: React.FocusEvent<HTMLInputElement>) =>
    (e.currentTarget.style.border = '1px solid rgba(255,255,255,0.22)');
  const inputBlur = (e: React.FocusEvent<HTMLInputElement>) =>
    (e.currentTarget.style.border = '1px solid rgba(255,255,255,0.08)');

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 50,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
              pointerEvents: 'none',
            }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div
              style={{
                width: '100%',
                maxWidth: '384px',
                pointerEvents: 'auto',
                overflowY: 'auto',
                background: 'rgba(12, 12, 20, 0.97)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '16px',
                boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
                maxHeight: 'calc(100dvh - 32px)',
              }}
            initial={{ scale: 0.94, y: 16, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1, transition: { duration: 0.25, ease: 'circOut' } }}
            exit={{ scale: 0.94, y: 8, opacity: 0, transition: { duration: 0.18 } }}
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-base font-semibold text-white">비밀번호 변경</h2>
                  <button onClick={onClose}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-all text-lg leading-none">
                    ✕
                  </button>
                </div>

                <AnimatePresence mode="wait">
                  {success ? (
                    <motion.div
                      key="success"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex flex-col items-center py-6 gap-3"
                    >
                      <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-2xl">
                        ✓
                      </div>
                      <p className="text-sm text-white/70">비밀번호가 변경되었습니다</p>
                    </motion.div>
                  ) : (
                    <motion.form key="form" onSubmit={handleSubmit} className="space-y-3">
                      <div>
                        <label className="block text-[11px] text-white/35 mb-1.5 tracking-wider uppercase">
                          현재 비밀번호
                        </label>
                        <input
                          type="password" value={current} onChange={e => setCurrent(e.target.value)}
                          required autoFocus placeholder="현재 비밀번호 입력"
                          className={inputClass} style={{ ...inputStyle }}
                          onFocus={inputFocus} onBlur={inputBlur}
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] text-white/35 mb-1.5 tracking-wider uppercase">
                          새 비밀번호
                        </label>
                        <input
                          type="password" value={next} onChange={e => setNext(e.target.value)}
                          required minLength={6} placeholder="6자 이상"
                          className={inputClass} style={{ ...inputStyle }}
                          onFocus={inputFocus} onBlur={inputBlur}
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] text-white/35 mb-1.5 tracking-wider uppercase">
                          새 비밀번호 확인
                        </label>
                        <input
                          type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                          required placeholder="동일하게 입력"
                          className={inputClass} style={{ ...inputStyle }}
                          onFocus={inputFocus} onBlur={inputBlur}
                        />
                      </div>

                      <AnimatePresence>
                        {error && (
                          <motion.p
                            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                            className="text-xs text-red-400 px-1 pt-0.5"
                          >
                            {error}
                          </motion.p>
                        )}
                      </AnimatePresence>

                      <div className="flex gap-2 pt-2">
                        <button type="button" onClick={onClose}
                          className="flex-1 py-2.5 rounded-xl text-sm text-white/40 hover:text-white/70 transition-colors"
                          style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                          취소
                        </button>
                        <button type="submit" disabled={loading}
                          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-black transition-all"
                          style={{ background: loading ? 'rgba(255,255,255,0.4)' : '#ffffff', cursor: loading ? 'not-allowed' : 'pointer' }}>
                          {loading ? '변경 중...' : '변경'}
                        </button>
                      </div>
                    </motion.form>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
