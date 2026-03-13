import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';

export default function RegisterPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('비밀번호는 6자 이상이어야 합니다'); return; }
    if (password !== confirm) { setError('비밀번호가 일치하지 않습니다'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || '회원가입 실패');
      }
      const data = await res.json();
      localStorage.setItem('token', data.access_token);
      navigate('/', { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '회원가입 실패');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#06060c' }}>
        <div className="text-center">
          <p className="text-white/40 text-sm">유효하지 않은 초대 링크입니다</p>
          <button onClick={() => navigate('/login')} className="mt-4 text-xs text-white/60 hover:text-white underline">
            로그인 페이지로
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.03) 0%, transparent 60%), #06060c' }}>

      <motion.div
        initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.5, ease: 'circOut' }}
        className="w-full max-w-sm"
      >
        <div className="flex items-center gap-2.5 mb-10">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-white">
            <span className="text-black text-sm font-bold">L</span>
          </div>
          <span className="text-sm font-semibold tracking-widest text-white/80 uppercase">
            Lyric Video Studio
          </span>
        </div>

        <h1 className="text-2xl font-semibold text-white mb-1">회원가입</h1>
        <p className="text-sm text-white/40 mb-8">초대를 받으셨습니다. 비밀번호를 설정해 주세요.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-white/40 mb-2 tracking-wider uppercase">비밀번호</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              required autoFocus minLength={6}
              className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-white/20 outline-none transition-all"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
              onFocus={e => (e.currentTarget.style.border = '1px solid rgba(255,255,255,0.2)')}
              onBlur={e => (e.currentTarget.style.border = '1px solid rgba(255,255,255,0.08)')}
              placeholder="6자 이상"
            />
          </div>

          <div>
            <label className="block text-xs text-white/40 mb-2 tracking-wider uppercase">비밀번호 확인</label>
            <input
              type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-white/20 outline-none transition-all"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
              onFocus={e => (e.currentTarget.style.border = '1px solid rgba(255,255,255,0.2)')}
              onBlur={e => (e.currentTarget.style.border = '1px solid rgba(255,255,255,0.08)')}
              placeholder="동일하게 입력"
            />
          </div>

          {error && (
            <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
              className="text-xs text-red-400 px-1">
              {error}
            </motion.p>
          )}

          <button
            type="submit" disabled={loading}
            className="w-full py-3 rounded-xl text-sm font-semibold text-black transition-all duration-200 mt-2"
            style={{ background: loading ? 'rgba(255,255,255,0.5)' : '#ffffff', cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? '처리 중...' : '가입 완료'}
          </button>
        </form>

        <button onClick={() => navigate('/login')} className="mt-6 text-xs text-white/30 hover:text-white/60 transition-colors">
          ← 로그인 페이지로
        </button>
      </motion.div>
    </div>
  );
}
