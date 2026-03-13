import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { authFetch } from '../utils/api';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function InviteModal({ open, onClose }: Props) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [registerUrl, setRegisterUrl] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('loading');
    try {
      const res = await authFetch('/api/auth/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.detail || '초대 실패');
        setStatus('error');
        return;
      }
      setMessage(data.message || '초대장을 발송했습니다');
      setRegisterUrl(data.register_url || '');
      setStatus('done');
    } catch {
      setMessage('네트워크 오류가 발생했습니다');
      setStatus('error');
    }
  };

  const handleClose = () => {
    setEmail('');
    setStatus('idle');
    setMessage('');
    setRegisterUrl('');
    onClose();
  };

  const copyLink = () => {
    navigator.clipboard.writeText(registerUrl);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.7)',
              backdropFilter: 'blur(4px)',
              zIndex: 9998,
            }}
          />

          {/* Centering wrapper — flexbox centering avoids transform conflict with Framer Motion */}
          <div style={{
            position: 'fixed', inset: 0,
            zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px',
            pointerEvents: 'none',
          }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            style={{
              pointerEvents: 'auto',
              width: '100%',
              maxWidth: '440px',
            }}
          >
            <div style={{
              background: '#111111',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '20px',
              padding: '32px',
              boxShadow: '0 32px 80px rgba(0,0,0,0.8)',
            }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                <div>
                  <h2 style={{
                    margin: 0, fontSize: '18px', fontWeight: 700,
                    color: '#ffffff', letterSpacing: '-0.02em',
                  }}>사용자 초대</h2>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#525252' }}>
                    초대 링크를 이메일로 발송합니다
                  </p>
                </div>
                <button
                  onClick={handleClose}
                  style={{
                    background: 'rgba(255,255,255,0.06)', border: 'none',
                    borderRadius: '8px', color: '#737373', cursor: 'pointer',
                    padding: '6px 10px', fontSize: '16px', lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              </div>

              <AnimatePresence mode="wait">
                {status !== 'done' ? (
                  <motion.form
                    key="form"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onSubmit={handleSubmit}
                  >
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{
                        display: 'block', fontSize: '11px', fontWeight: 600,
                        letterSpacing: '0.08em', textTransform: 'uppercase',
                        color: '#525252', marginBottom: '8px',
                      }}>
                        초대할 이메일 주소
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="someone@example.com"
                        required
                        disabled={status === 'loading'}
                        style={{
                          width: '100%', boxSizing: 'border-box',
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '12px', padding: '12px 16px',
                          color: '#ffffff', fontSize: '14px', outline: 'none',
                          transition: 'border-color 0.2s',
                        }}
                        onFocus={e => { e.target.style.borderColor = 'rgba(255,255,255,0.3)'; }}
                        onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                      />
                    </div>

                    {status === 'error' && (
                      <motion.p
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{
                          color: '#ef4444', fontSize: '13px',
                          marginBottom: '12px', padding: '10px 14px',
                          background: 'rgba(239,68,68,0.1)',
                          borderRadius: '8px', margin: '0 0 16px',
                        }}
                      >
                        {message}
                      </motion.p>
                    )}

                    <button
                      type="submit"
                      disabled={status === 'loading' || !email.trim()}
                      style={{
                        width: '100%', padding: '13px',
                        background: status === 'loading' ? 'rgba(255,255,255,0.1)' : '#ffffff',
                        color: status === 'loading' ? '#737373' : '#000000',
                        border: 'none', borderRadius: '12px',
                        fontSize: '14px', fontWeight: 700,
                        cursor: status === 'loading' ? 'not-allowed' : 'pointer',
                        letterSpacing: '-0.01em', transition: 'all 0.2s',
                      }}
                    >
                      {status === 'loading' ? '발송 중...' : '초대 링크 생성 및 발송'}
                    </button>
                  </motion.form>
                ) : (
                  <motion.div
                    key="done"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <div style={{
                      textAlign: 'center', padding: '12px 0 20px',
                    }}>
                      <div style={{ fontSize: '36px', marginBottom: '12px' }}>✅</div>
                      <p style={{ color: '#ffffff', fontSize: '15px', fontWeight: 600, margin: '0 0 4px' }}>
                        {message}
                      </p>
                      <p style={{ color: '#525252', fontSize: '13px', margin: 0 }}>
                        {email}
                      </p>
                    </div>

                    {registerUrl && (
                      <div style={{ marginBottom: '20px' }}>
                        <label style={{
                          display: 'block', fontSize: '11px', fontWeight: 600,
                          letterSpacing: '0.08em', textTransform: 'uppercase',
                          color: '#525252', marginBottom: '8px',
                        }}>
                          초대 링크 (SMTP 미설정 시 직접 공유)
                        </label>
                        <div style={{
                          display: 'flex', gap: '8px', alignItems: 'center',
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: '10px', padding: '10px 12px',
                        }}>
                          <span style={{
                            flex: 1, fontSize: '12px', color: '#a3a3a3',
                            overflow: 'hidden', textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                            {registerUrl}
                          </span>
                          <button
                            onClick={copyLink}
                            style={{
                              background: 'rgba(255,255,255,0.1)', border: 'none',
                              borderRadius: '6px', color: '#ffffff', cursor: 'pointer',
                              padding: '4px 10px', fontSize: '12px', flexShrink: 0,
                              fontWeight: 600,
                            }}
                          >
                            복사
                          </button>
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => { setEmail(''); setStatus('idle'); setMessage(''); setRegisterUrl(''); }}
                        style={{
                          flex: 1, padding: '12px',
                          background: 'rgba(255,255,255,0.06)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: '10px', color: '#a3a3a3',
                          fontSize: '13px', cursor: 'pointer', fontWeight: 600,
                        }}
                      >
                        추가 초대
                      </button>
                      <button
                        onClick={handleClose}
                        style={{
                          flex: 1, padding: '12px',
                          background: '#ffffff', border: 'none',
                          borderRadius: '10px', color: '#000000',
                          fontSize: '13px', cursor: 'pointer', fontWeight: 700,
                        }}
                      >
                        닫기
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
