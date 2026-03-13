import { useState, useRef, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ImageCropper from './ImageCropper';
import type { RecentProject, AppStep } from '../types';

const SINGER_COLORS = [
  [220,130,70], [100,180,255], [230,100,160], [120,220,160], [180,130,255],
  [255,200,80], [100,220,220], [255,130,130], [160,200,100], [200,160,220],
];

const DEFAULT_ARTS = [
  { id: 'gradient-purple', label: 'Purple', url: '/defaults/gradient-purple.jpg' },
  { id: 'gradient-ocean', label: 'Ocean', url: '/defaults/gradient-ocean.jpg' },
  { id: 'gradient-sunset', label: 'Sunset', url: '/defaults/gradient-sunset.jpg' },
  { id: 'gradient-night', label: 'Night', url: '/defaults/gradient-night.jpg' },
];

interface Props {
  onUploadComplete: (projectId: string) => void;
  onLoadProject?: (projectId: string, step: AppStep) => void;
}

const stagger = { animate: { transition: { staggerChildren: 0.1 } } };
const fadeUp = {
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
};

export default function FileUpload({ onUploadComplete, onLoadProject }: Props) {
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [artworkFile, setArtworkFile] = useState<File | null>(null);
  const [lyrics, setLyrics] = useState('');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [uploading, setUploading] = useState(false);
  const [artPreview, setArtPreview] = useState<string | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  const [rawArtUrl, setRawArtUrl] = useState<string | null>(null);
  const [selectedDefault, setSelectedDefault] = useState<string | null>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const artInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/project/').then(r => r.json()).then(setRecentProjects).catch(() => {});
  }, []);

  const deleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/project/${id}`, { method: 'DELETE' });
    setRecentProjects(prev => prev.filter(p => p.project_id !== id));
  };

  const detectedSingers = useMemo(() => {
    const matches = lyrics.match(/^\[(.+)\]$/gm);
    if (!matches) return [];
    return [...new Set(matches.map(m => m.replace(/^\[|\]$/g, '').trim()))];
  }, [lyrics]);

  const handleArtworkSelected = (file: File) => {
    const url = URL.createObjectURL(file);
    setRawArtUrl(url);
    setShowCropper(true);
  };

  const handleCropDone = (blob: Blob) => {
    const cropped = new File([blob], 'artwork.jpg', { type: 'image/jpeg' });
    setArtworkFile(cropped);
    setArtPreview(URL.createObjectURL(blob));
    setShowCropper(false);
    if (rawArtUrl) URL.revokeObjectURL(rawArtUrl);
    setRawArtUrl(null);
  };

  const handleCropCancel = () => {
    setShowCropper(false);
    if (rawArtUrl) URL.revokeObjectURL(rawArtUrl);
    setRawArtUrl(null);
  };

  const selectDefaultArt = async (url: string, id: string) => {
    const res = await fetch(url);
    const blob = await res.blob();
    const file = new File([blob], `${id}.jpg`, { type: 'image/jpeg' });
    setArtworkFile(file);
    setArtPreview(url);
    setSelectedDefault(id);
  };

  const handleSubmit = async () => {
    if (!audioFile || !artworkFile || !lyrics.trim()) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('audio', audioFile);
      form.append('artwork', artworkFile);
      const uploadRes = await fetch('/api/upload/all', { method: 'POST', body: form });
      const { project_id, audio_filename, artwork_filename } = await uploadRes.json();
      const rawLines = lyrics.split('\n').filter(l => l.trim());
      let currentSinger: string | undefined;
      const lyricLines: { index: number; text: string; start_time: number; end_time: null; singer?: string }[] = [];
      let idx = 0;
      for (const raw of rawLines) {
        const trimmed = raw.trim();
        const tagMatch = trimmed.match(/^\[(.+)\]$/);
        if (tagMatch) {
          currentSinger = tagMatch[1].trim();
          continue;
        }
        lyricLines.push({ index: idx++, text: trimmed, start_time: 0, end_time: null, singer: currentSinger });
      }
      await fetch(`/api/project/${project_id}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id, title: title || 'Untitled', artist: artist || 'Unknown',
          audio_filename, artwork_filename, lyrics: lyricLines,
        }),
      });
      onUploadComplete(project_id);
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
    }
  };

  const canSubmit = audioFile && artworkFile && lyrics.trim();
  const lineCount = lyrics.split('\n').filter(l => l.trim()).length;
  const readyCount = [audioFile, artworkFile, lyrics.trim()].filter(Boolean).length;

  return (
    <div className="relative min-h-[80vh] flex items-center justify-center">
      {/* Crop modal */}
      <AnimatePresence>
        {showCropper && rawArtUrl && (
          <ImageCropper imageUrl={rawArtUrl} onCrop={handleCropDone} onCancel={handleCropCancel} />
        )}
      </AnimatePresence>

      {/* Animated background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <motion.div
          animate={{ x: [0, 40, -20, 0], y: [0, -30, 20, 0], scale: [1, 1.1, 0.95, 1] }}
          transition={{ repeat: Infinity, duration: 12, ease: 'easeInOut' }}
          className="absolute top-[10%] left-[15%] w-[500px] h-[500px] rounded-full opacity-[0.03]"
          style={{ background: 'radial-gradient(circle, #ffffff, transparent 65%)' }}
        />
        <motion.div
          animate={{ x: [0, -30, 25, 0], y: [0, 25, -35, 0], scale: [1, 0.95, 1.08, 1] }}
          transition={{ repeat: Infinity, duration: 15, ease: 'easeInOut' }}
          className="absolute bottom-[5%] right-[10%] w-[600px] h-[600px] rounded-full opacity-[0.02]"
          style={{ background: 'radial-gradient(circle, #a3a3a3, transparent 65%)' }}
        />
        <motion.div
          animate={{ x: [0, 20, -15, 0], y: [0, -20, 30, 0] }}
          transition={{ repeat: Infinity, duration: 18, ease: 'easeInOut' }}
          className="absolute top-[50%] left-[50%] w-[400px] h-[400px] rounded-full opacity-[0.02]"
          style={{ background: 'radial-gradient(circle, #525252, transparent 65%)' }}
        />
      </div>

      <motion.div className="relative z-10 w-full max-w-2xl mx-auto" variants={stagger} initial="initial" animate="animate">
        {/* Hero */}
        <motion.div variants={fadeUp} className="text-center mb-10">
          <motion.div className="inline-block mb-4"
            animate={{ rotate: [0, 5, -5, 0] }}
            transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}>
            <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center text-2xl"
              style={{ background: 'linear-gradient(135deg, #262626, #404040)', boxShadow: '0 8px 40px rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
              🎬
            </div>
          </motion.div>
          <h1 className="text-5xl font-extrabold tracking-tight mb-3" style={{ fontFamily: 'var(--font-display)' }}>
            LYRIC VIDEO STUDIO
          </h1>
          <p className="text-[var(--color-text-secondary)] text-sm tracking-wide max-w-sm mx-auto">
            음악과 가사를 올리고 · 리듬에 맞춰 싱크하고 · 딸깍으로 리릭비디오를 만드세요
          </p>
          <div className="flex justify-center gap-2 mt-5">
            {[audioFile, artworkFile, lyrics.trim()].map((v, i) => (
              <motion.div key={i}
                animate={{ scale: v ? [1, 1.3, 1] : 1, backgroundColor: v ? '#ffffff' : 'rgba(255,255,255,0.1)' }}
                transition={{ duration: 0.4 }}
                className="w-2 h-2 rounded-full" />
            ))}
          </div>
        </motion.div>

        {/* Upload cards */}
        <motion.div variants={fadeUp} className="grid grid-cols-2 gap-4 mb-5">
          {/* Audio card */}
          <motion.div
            whileHover={{ scale: 1.03, y: -4 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => audioInputRef.current?.click()}
            className="glass glass-hover rounded-2xl p-6 cursor-pointer transition-all group relative overflow-hidden"
          >
            <input ref={audioInputRef} type="file" accept=".mp3,.wav,.flac,.ogg,.m4a" className="hidden"
              onChange={e => setAudioFile(e.target.files?.[0] || null)} />
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              style={{ background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.01))' }} />
            <div className="relative z-10 text-center">
              <motion.div className="text-4xl mb-3 inline-block"
                animate={audioFile ? { scale: [1, 1.2, 1] } : { y: [0, -6, 0] }}
                transition={{ duration: 2, repeat: Infinity }}>
                {audioFile ? '✅' : '🎵'}
              </motion.div>
              <p className="font-semibold text-sm" style={{ fontFamily: 'var(--font-display)' }}>
                {audioFile ? 'AUDIO READY' : 'AUDIO FILE'}
              </p>
              {audioFile && (
                <p className="text-[10px] mt-1 break-all leading-tight max-h-[3rem] overflow-hidden"
                  style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}
                  title={audioFile.name}>
                  {audioFile.name}
                </p>
              )}
              <p className="text-xs mt-1" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>
                MP3 · WAV · FLAC
              </p>
              <AnimatePresence>
                {audioFile && (
                  <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="mt-2 inline-block px-3 py-1 rounded-full text-[10px] font-bold"
                    style={{ background: 'rgba(255, 255, 255, 0.1)', color: 'var(--color-text-primary)' }}>
                    READY
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* Artwork card */}
          <div className="glass rounded-2xl p-5 relative overflow-hidden">
            <input ref={artInputRef} type="file" accept=".png,.jpg,.jpeg,.webp" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) { setSelectedDefault(null); handleArtworkSelected(f); }}} />
            <div className="relative z-10 text-center">
              {artPreview ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <div className="w-full flex justify-center mb-2">
                    <img src={artPreview} className="w-24 h-24 object-cover rounded-xl" alt="artwork" />
                  </div>
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                    className="inline-block px-3 py-1 rounded-full text-[10px] font-bold"
                    style={{ background: 'rgba(255, 255, 255, 0.1)', color: 'var(--color-text-primary)' }}>
                    {selectedDefault ? 'DEFAULT' : 'CROPPED'} · READY
                  </motion.div>
                  <button onClick={(e) => { e.stopPropagation(); artInputRef.current?.click(); }}
                    className="block mx-auto mt-1.5 text-[10px] underline opacity-50 hover:opacity-80 transition-opacity"
                    style={{ color: 'var(--color-text-secondary)' }}>
                    직접 업로드로 변경
                  </button>
                </motion.div>
              ) : (
                <>
                  <motion.div className="text-3xl mb-2 inline-block"
                    whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}
                    onClick={() => artInputRef.current?.click()}
                    style={{ cursor: 'pointer' }}>
                    🎨
                  </motion.div>
                  <p className="font-semibold text-xs mb-1" style={{ fontFamily: 'var(--font-display)' }}>ALBUM ART</p>
                  <motion.button
                    whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                    onClick={() => artInputRef.current?.click()}
                    className="text-[10px] px-3 py-1 rounded-full mb-2.5"
                    style={{ background: 'rgba(255, 255, 255, 0.1)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>
                    직접 업로드
                  </motion.button>
                  <p className="text-[10px] mb-2" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                    또는 기본 아트 선택 ↓
                  </p>
                  <div className="flex justify-center gap-1.5">
                    {DEFAULT_ARTS.map(da => (
                      <motion.button key={da.id}
                        whileHover={{ scale: 1.15, y: -2 }} whileTap={{ scale: 0.9 }}
                        onClick={() => selectDefaultArt(da.url, da.id)}
                        className="w-10 h-10 rounded-lg overflow-hidden border-2 transition-all"
                        style={{ borderColor: selectedDefault === da.id ? 'var(--color-accent)' : 'transparent' }}>
                        <img src={da.url} alt={da.label} className="w-full h-full object-cover" />
                      </motion.button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </motion.div>

        {/* Meta inputs */}
        <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 mb-5">
          <input type="text" placeholder="곡 제목" value={title} onChange={e => setTitle(e.target.value)}
            className="glass rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/40 transition-all placeholder:text-[var(--color-text-muted)]"
            style={{ fontFamily: 'var(--font-body)' }} />
          <input type="text" placeholder="아티스트" value={artist} onChange={e => setArtist(e.target.value)}
            className="glass rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/40 transition-all placeholder:text-[var(--color-text-muted)]"
            style={{ fontFamily: 'var(--font-body)' }} />
        </motion.div>

        {/* Lyrics */}
        <motion.div variants={fadeUp} className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2">
          <span className="text-xs tracking-widest uppercase" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text-primary)' }}>
            LYRICS
          </span>
              <div className="relative group">
                <span className="text-[10px] px-1.5 py-0.5 rounded cursor-help"
                  style={{ background: 'rgba(255, 255, 255, 0.1)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>
                  TIP
                </span>
                <div className="absolute left-0 top-full mt-1 w-56 p-3 rounded-xl text-[11px] leading-relaxed opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50"
                  style={{ background: 'rgba(20, 20, 20, 0.95)', border: '1px solid rgba(255, 255, 255, 0.1)', backdropFilter: 'blur(12px)', color: 'var(--color-text-secondary)' }}>
                  <span className="font-bold" style={{ color: 'var(--color-text-primary)' }}>[가수이름]</span> 태그로 파트를 구분할 수 있어요!<br/>
                  <span className="opacity-60 mt-1 block" style={{ fontFamily: 'var(--font-mono)' }}>
                    [Yi Will]<br/>가사 1줄<br/>가사 2줄<br/>[Halim]<br/>가사 3줄...
                  </span>
                  <span className="block mt-1.5 opacity-50">각 파트는 다른 색상으로 표시됩니다</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <AnimatePresence>
                {detectedSingers.length > 0 && (
                  <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                    className="flex items-center gap-1">
                    {detectedSingers.map((s, i) => {
                      const c = SINGER_COLORS[i % SINGER_COLORS.length];
                      return (
                        <motion.span key={s} initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.08 }}
                          className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                          style={{
                            background: `rgba(${c[0]}, ${c[1]}, ${c[2]}, 0.2)`,
                            color: `rgb(${c[0]}, ${c[1]}, ${c[2]})`,
                            fontFamily: 'var(--font-mono)',
                          }}>
                          {s}
                        </motion.span>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
              <AnimatePresence>
                {lineCount > 0 && (
                  <motion.span initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                    className="text-xs px-2.5 py-0.5 rounded-full"
                    style={{ background: 'rgba(255, 255, 255, 0.1)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>
                    {lineCount} lines
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </div>
          <textarea rows={8}
            placeholder={"[가수이름]\n첫 번째 줄 가사\n두 번째 줄 가사\n\n[다른가수]\n세 번째 줄 가사\n..."}
            value={lyrics} onChange={e => setLyrics(e.target.value)}
            className="w-full glass rounded-xl px-4 py-3 text-sm leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/30 transition-all placeholder:text-[var(--color-text-muted)]"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }} />
        </motion.div>

        {/* Submit */}
        <motion.div variants={fadeUp}>
          <motion.button
            whileHover={canSubmit ? { scale: 1.02, y: -2 } : {}}
            whileTap={canSubmit ? { scale: 0.97 } : {}}
            onClick={handleSubmit} disabled={!canSubmit || uploading}
            className="w-full py-4 rounded-2xl font-bold text-base tracking-wide transition-all disabled:opacity-20 disabled:cursor-not-allowed relative overflow-hidden"
            style={{
              fontFamily: 'var(--font-display)',
              background: canSubmit ? '#ffffff' : 'rgba(255,255,255,0.04)',
              color: canSubmit ? '#000000' : 'var(--color-text-primary)',
              boxShadow: canSubmit ? '0 8px 40px rgba(255, 255, 255, 0.15)' : 'none',
            }}>
            {uploading ? (
              <span className="flex items-center justify-center gap-2">
                <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>⏳</motion.span>
                UPLOADING...
              </span>
            ) : (
              `START SYNC → ${readyCount}/3 READY`
            )}
          </motion.button>
        </motion.div>

        {/* Recent Projects */}
        {recentProjects.length > 0 && onLoadProject && (
          <motion.div variants={fadeUp} className="mt-10">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-4 rounded-full" style={{ background: 'var(--color-text-primary)' }} />
              <h3 className="text-sm font-bold tracking-wide uppercase" style={{ fontFamily: 'var(--font-display)' }}>
                RECENT PROJECTS
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(255, 255, 255, 0.1)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>
                {recentProjects.length}
              </span>
            </div>
            <div className="space-y-2.5">
              {recentProjects.map((proj, i) => (
                <motion.div
                  key={proj.project_id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 * i }}
                  className="glass glass-hover rounded-xl p-4 group relative overflow-hidden"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 mb-1.5">
                        {proj.has_artwork && (
                          <img src={`/api/project/${proj.project_id}/artwork`} alt=""
                            className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                            onError={e => (e.currentTarget.style.display = 'none')} />
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate" style={{ fontFamily: 'var(--font-display)' }}>
                            {proj.title}
                          </p>
                          <p className="text-[11px] truncate" style={{ fontFamily: 'var(--font-body)', color: 'var(--color-text-secondary)' }}>
                            {proj.artist}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-2 py-0.5 rounded-full"
                          style={{ fontFamily: 'var(--font-mono)', background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-muted)' }}>
                          {proj.lyrics_count} lines
                        </span>
                        {proj.has_sync && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full"
                            style={{ fontFamily: 'var(--font-mono)', background: 'rgba(52, 211, 153, 0.1)', color: 'var(--color-success)' }}>
                            SYNCED
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 ml-3">
                      <motion.button
                        whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                        onClick={() => onLoadProject(proj.project_id, 'sync')}
                        className="px-3 py-2 rounded-lg text-[11px] font-bold"
                        style={{ fontFamily: 'var(--font-display)', background: 'rgba(255, 255, 255, 0.1)', color: 'var(--color-text-primary)' }}>
                        SYNC
                      </motion.button>
                      {proj.has_sync && (
                        <>
                          <motion.button
                            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                            onClick={() => onLoadProject(proj.project_id, 'preview')}
                            className="px-3 py-2 rounded-lg text-[11px] font-bold"
                            style={{ fontFamily: 'var(--font-display)', background: 'rgba(255, 255, 255, 0.1)', color: 'var(--color-text-primary)' }}>
                            PREVIEW
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                            onClick={() => onLoadProject(proj.project_id, 'generate')}
                            className="px-3 py-2 rounded-lg text-[11px] font-bold"
                            style={{ fontFamily: 'var(--font-display)', background: 'rgba(255, 255, 255, 0.1)', color: 'var(--color-text-primary)' }}>
                            RENDER
                          </motion.button>
                        </>
                      )}
                      <motion.button
                        whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                        onClick={(e) => deleteProject(proj.project_id, e)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                        style={{ background: 'rgba(244, 63, 94, 0.1)', color: 'var(--color-danger)' }}>
                        ✕
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
