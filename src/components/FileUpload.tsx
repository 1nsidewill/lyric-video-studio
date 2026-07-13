import { useState, useRef, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ImageCropper from './ImageCropper';
import { createProject, listProjects, deleteProject as removeProject } from '../lib/storage';
import { springSoft } from '../lib/motion';
import { IconFilm, IconMusic, IconImage, IconCheck, IconTrash, IconArrowRight, IconUpload } from './icons';
import type { RecentProject, AppStep, LyricLine } from '../types';

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

const stagger = { animate: { transition: { staggerChildren: 0.06 } } };
const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
};

export default function FileUpload({ onUploadComplete, onLoadProject }: Props) {
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [artworkFile, setArtworkFile] = useState<File | null>(null);
  const [lyrics, setLyrics] = useState('');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [uploading, setUploading] = useState(false);
  const [artPreview, setArtPreview] = useState<string | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  const [rawArtUrl, setRawArtUrl] = useState<string | null>(null);
  const [selectedDefault, setSelectedDefault] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const artInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listProjects().then(setRecentProjects).catch(() => {});
  }, []);

  const deleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await removeProject(id);
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

  // Desktop drag & drop — route dropped files to audio / artwork by extension.
  const routeDroppedFile = (file: File) => {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (['mp3', 'wav', 'flac', 'ogg', 'm4a'].includes(ext)) {
      setAudioFile(file);
    } else if (['png', 'jpg', 'jpeg', 'webp', 'bmp'].includes(ext)) {
      setSelectedDefault(null);
      handleArtworkSelected(file);
    }
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    Array.from(e.dataTransfer.files).forEach(routeDroppedFile);
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
      const rawLines = lyrics.split('\n').filter(l => l.trim());
      let currentSinger: string | undefined;
      const lyricLines: LyricLine[] = [];
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
      const audioExt = (audioFile.name.split('.').pop() || 'mp3').toLowerCase();
      const projectId = await createProject({
        title: title || 'Untitled',
        artist: artist || 'Unknown',
        album: album.trim() || undefined,
        lyrics: lyricLines,
        audio: { bytes: new Uint8Array(await audioFile.arrayBuffer()), ext: audioExt },
        artwork: { bytes: new Uint8Array(await artworkFile.arrayBuffer()), ext: 'jpg' },
      });
      onUploadComplete(projectId);
    } catch (err) {
      console.error('Project creation failed:', err);
    } finally {
      setUploading(false);
    }
  };

  const canSubmit = audioFile && artworkFile && lyrics.trim();
  const lineCount = lyrics.split('\n').filter(l => l.trim()).length;
  const readyCount = [audioFile, artworkFile, lyrics.trim()].filter(Boolean).length;

  return (
    <div className="relative min-h-[80vh] flex items-center justify-center"
      onDragOver={(e) => { e.preventDefault(); if (!dragging) setDragging(true); }}
      onDragLeave={(e) => { if (e.relatedTarget === null) setDragging(false); }}
      onDrop={handleDrop}>
      {/* Drag & drop overlay */}
      <AnimatePresence>
        {dragging && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
            style={{ background: 'rgba(6,6,12,0.72)', backdropFilter: 'blur(8px)' }}>
            <motion.div initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={springSoft}
              className="rounded-3xl px-16 py-14 text-center"
              style={{ border: '1.5px dashed rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.03)' }}>
              <div className="flex items-center justify-center gap-3 mb-4 text-[var(--color-text-secondary)]">
                <IconMusic size={30} /><IconImage size={30} />
              </div>
              <p className="text-lg font-semibold tracking-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text-primary)' }}>
                여기에 놓으세요
              </p>
              <p className="text-xs mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
                오디오 (MP3 · WAV · FLAC) 또는 앨범아트 (PNG · JPG)
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Crop modal */}
      <AnimatePresence>
        {showCropper && rawArtUrl && (
          <ImageCropper imageUrl={rawArtUrl} onCrop={handleCropDone} onCancel={handleCropCancel} />
        )}
      </AnimatePresence>

      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <motion.div
          animate={{ x: [0, 40, -20, 0], y: [0, -30, 20, 0] }}
          transition={{ repeat: Infinity, duration: 22, ease: 'easeInOut' }}
          className="absolute top-[8%] left-[12%] w-[520px] h-[520px] rounded-full opacity-[0.025]"
          style={{ background: 'radial-gradient(circle, #ffffff, transparent 65%)' }}
        />
        <motion.div
          animate={{ x: [0, -30, 25, 0], y: [0, 25, -35, 0] }}
          transition={{ repeat: Infinity, duration: 26, ease: 'easeInOut' }}
          className="absolute bottom-[4%] right-[8%] w-[600px] h-[600px] rounded-full opacity-[0.02]"
          style={{ background: 'radial-gradient(circle, #a3a3a3, transparent 65%)' }}
        />
      </div>

      <motion.div className="relative z-10 w-full max-w-2xl mx-auto py-10" variants={stagger} initial="initial" animate="animate">
        {/* Hero */}
        <motion.div variants={fadeUp} className="text-center mb-9">
          <div className="w-14 h-14 mx-auto mb-5 rounded-2xl flex items-center justify-center glass-strong text-[var(--color-text-primary)]">
            <IconFilm size={26} />
          </div>
          <h1 className="text-[2.6rem] leading-none font-bold tracking-tight mb-3" style={{ fontFamily: 'var(--font-display)' }}>
            Lyric Video Studio
          </h1>
          <p className="text-[var(--color-text-secondary)] text-sm max-w-sm mx-auto leading-relaxed">
            음악과 가사를 올리고 · 리듬에 맞춰 싱크하고 · 리릭비디오를 만드세요
          </p>
          <div className="flex justify-center gap-1.5 mt-5">
            {[audioFile, artworkFile, lyrics.trim()].map((v, i) => (
              <motion.div key={i}
                animate={{ scale: v ? 1 : 0.7, opacity: v ? 1 : 0.4 }}
                transition={springSoft}
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: v ? '#ffffff' : 'rgba(255,255,255,0.4)' }} />
            ))}
          </div>
        </motion.div>

        {/* Upload cards */}
        <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3.5 mb-4">
          {/* Audio card */}
          <motion.div
            whileHover={{ scale: 1.015, y: -2 }} whileTap={{ scale: 0.985 }} transition={springSoft}
            onClick={() => audioInputRef.current?.click()}
            className="glass glass-hover rounded-2xl p-6 cursor-pointer relative overflow-hidden"
          >
            <input ref={audioInputRef} type="file" accept=".mp3,.wav,.flac,.ogg,.m4a" className="hidden"
              onChange={e => setAudioFile(e.target.files?.[0] || null)} />
            <div className="relative z-10 text-center">
              <div className="w-11 h-11 mx-auto mb-3 rounded-xl flex items-center justify-center"
                style={{ background: audioFile ? '#ffffff' : 'rgba(255,255,255,0.07)', color: audioFile ? '#000' : 'var(--color-text-secondary)' }}>
                {audioFile ? <IconCheck size={22} /> : <IconMusic size={22} />}
              </div>
              <p className="font-semibold text-sm tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                {audioFile ? '오디오 준비됨' : '오디오 파일'}
              </p>
              {audioFile ? (
                <p className="text-[10px] mt-1 break-all leading-tight max-h-[2.4rem] overflow-hidden"
                  style={{ color: 'var(--color-text-secondary)' }} title={audioFile.name}>
                  {audioFile.name}
                </p>
              ) : (
                <p className="text-[11px] mt-1 tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
                  MP3 · WAV · FLAC
                </p>
              )}
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
                    <img src={artPreview} className="w-[88px] h-[88px] object-cover rounded-xl" alt="artwork"
                      style={{ boxShadow: '0 6px 20px rgba(0,0,0,0.4)' }} />
                  </div>
                  <div className="inline-flex items-center gap-1 text-[10px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                    <IconCheck size={12} /> {selectedDefault ? '기본 아트' : '크롭 완료'}
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); artInputRef.current?.click(); }}
                    className="block mx-auto mt-1 text-[10px] opacity-50 hover:opacity-90 transition-opacity"
                    style={{ color: 'var(--color-text-secondary)' }}>
                    변경
                  </button>
                </motion.div>
              ) : (
                <>
                  <div className="w-11 h-11 mx-auto mb-2 rounded-xl flex items-center justify-center"
                    style={{ background: 'rgba(255,255,255,0.07)', color: 'var(--color-text-secondary)' }}>
                    <IconImage size={22} />
                  </div>
                  <p className="font-semibold text-sm mb-2 tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>앨범아트</p>
                  <motion.button
                    whileTap={{ scale: 0.96 }} transition={springSoft}
                    onClick={() => artInputRef.current?.click()}
                    className="inline-flex items-center gap-1 text-[11px] px-3 py-1 rounded-full mb-2.5"
                    style={{ background: 'rgba(255, 255, 255, 0.08)', color: 'var(--color-text-primary)' }}>
                    <IconUpload size={12} /> 업로드
                  </motion.button>
                  <p className="text-[10px] mb-2" style={{ color: 'var(--color-text-muted)' }}>또는 기본 아트</p>
                  <div className="flex justify-center gap-1.5">
                    {DEFAULT_ARTS.map(da => (
                      <motion.button key={da.id}
                        whileHover={{ scale: 1.12, y: -2 }} whileTap={{ scale: 0.92 }} transition={springSoft}
                        onClick={() => selectDefaultArt(da.url, da.id)}
                        className="w-9 h-9 rounded-lg overflow-hidden"
                        style={{ outline: selectedDefault === da.id ? '2px solid #fff' : '1px solid rgba(255,255,255,0.1)', outlineOffset: selectedDefault === da.id ? '1px' : '0' }}>
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
        <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 mb-4">
          <input type="text" placeholder="곡 제목" value={title} onChange={e => setTitle(e.target.value)}
            className="glass rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-white/25 transition-all placeholder:text-[var(--color-text-muted)]"
            style={{ fontFamily: 'var(--font-body)' }} />
          <input type="text" placeholder="아티스트" value={artist} onChange={e => setArtist(e.target.value)}
            className="glass rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-white/25 transition-all placeholder:text-[var(--color-text-muted)]"
            style={{ fontFamily: 'var(--font-body)' }} />
          <input type="text" placeholder="앨범명 (선택)" value={album} onChange={e => setAlbum(e.target.value)}
            className="col-span-2 glass rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-white/25 transition-all placeholder:text-[var(--color-text-muted)]"
            style={{ fontFamily: 'var(--font-body)' }} />
        </motion.div>

        {/* Lyrics */}
        <motion.div variants={fadeUp} className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] tracking-[0.15em] uppercase font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text-secondary)' }}>
                가사
              </span>
              <div className="relative group">
                <span className="text-[10px] px-1.5 py-0.5 rounded cursor-help"
                  style={{ background: 'rgba(255, 255, 255, 0.08)', color: 'var(--color-text-secondary)' }}>
                  TIP
                </span>
                <div className="absolute left-0 top-full mt-1.5 w-60 p-3 rounded-xl text-[11px] leading-relaxed opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 glass-strong"
                  style={{ color: 'var(--color-text-secondary)' }}>
                  <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>[가수이름]</span> 태그로 파트를 구분할 수 있어요.<br/>
                  <span className="opacity-60 mt-1 block" style={{ fontFamily: 'var(--font-mono)' }}>
                    [Yi Will]<br/>가사 1줄<br/>[Halim]<br/>가사 2줄…
                  </span>
                  <span className="block mt-1.5 opacity-50">파트마다 다른 색으로 표시됩니다</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <AnimatePresence>
                {detectedSingers.map((s, i) => {
                  const c = SINGER_COLORS[i % SINGER_COLORS.length];
                  return (
                    <motion.span key={s} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                      transition={springSoft}
                      className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                      style={{ background: `rgba(${c[0]}, ${c[1]}, ${c[2]}, 0.18)`, color: `rgb(${c[0]}, ${c[1]}, ${c[2]})` }}>
                      {s}
                    </motion.span>
                  );
                })}
              </AnimatePresence>
              {lineCount > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full tabular-nums"
                  style={{ background: 'rgba(255, 255, 255, 0.06)', color: 'var(--color-text-muted)' }}>
                  {lineCount}줄
                </span>
              )}
            </div>
          </div>
          <textarea rows={8}
            placeholder={"[가수이름]\n첫 번째 줄 가사\n두 번째 줄 가사\n\n[다른가수]\n세 번째 줄 가사…"}
            value={lyrics} onChange={e => setLyrics(e.target.value)}
            className="w-full glass rounded-xl px-4 py-3.5 text-sm leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-white/25 transition-all placeholder:text-[var(--color-text-muted)]"
            style={{ fontFamily: 'var(--font-body)', fontSize: '13.5px' }} />
        </motion.div>

        {/* Submit */}
        <motion.div variants={fadeUp}>
          <motion.button
            whileHover={canSubmit ? { scale: 1.01, y: -1 } : {}}
            whileTap={canSubmit ? { scale: 0.98 } : {}}
            transition={springSoft}
            onClick={handleSubmit} disabled={!canSubmit || uploading}
            className="w-full py-4 rounded-2xl font-semibold text-[15px] tracking-tight transition-colors disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{
              fontFamily: 'var(--font-display)',
              background: canSubmit ? '#ffffff' : 'rgba(255,255,255,0.05)',
              color: canSubmit ? '#000000' : 'var(--color-text-secondary)',
              boxShadow: canSubmit ? '0 10px 40px rgba(255, 255, 255, 0.12)' : 'none',
            }}>
            {uploading ? (
              <>
                <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
                  className="w-4 h-4 rounded-full border-2 border-black/25 border-t-black" />
                만드는 중…
              </>
            ) : (
              <>싱크 시작 <span className="opacity-40 tabular-nums text-sm">{readyCount}/3</span> <IconArrowRight size={18} /></>
            )}
          </motion.button>
        </motion.div>

        {/* Recent Projects */}
        {recentProjects.length > 0 && onLoadProject && (
          <motion.div variants={fadeUp} className="mt-10">
            <div className="flex items-center gap-2 mb-3.5 px-1">
              <h3 className="text-[11px] font-semibold tracking-[0.15em] uppercase" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text-secondary)' }}>
                최근 프로젝트
              </h3>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full tabular-nums"
                style={{ background: 'rgba(255, 255, 255, 0.06)', color: 'var(--color-text-muted)' }}>
                {recentProjects.length}
              </span>
            </div>
            <div className="space-y-2">
              {recentProjects.map((proj, i) => (
                <motion.div
                  key={proj.project_id}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.04 * i, ...springSoft }}
                  className="glass glass-hover rounded-2xl p-3 group flex items-center gap-3"
                >
                  {proj.artwork_src ? (
                    <img src={proj.artwork_src} alt=""
                      className="w-11 h-11 rounded-lg object-cover flex-shrink-0"
                      onError={e => (e.currentTarget.style.display = 'none')} />
                  ) : (
                    <div className="w-11 h-11 rounded-lg flex-shrink-0 flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-muted)' }}>
                      <IconMusic size={18} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                      {proj.title}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[11px] truncate" style={{ color: 'var(--color-text-secondary)' }}>{proj.artist}</span>
                      <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>· {proj.lyrics_count}줄</span>
                      {proj.has_sync && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full"
                          style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--color-text-secondary)' }}>
                          <IconCheck size={10} /> 싱크됨
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <motion.button whileTap={{ scale: 0.94 }} transition={springSoft}
                      onClick={() => onLoadProject(proj.project_id, 'sync')}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-semibold"
                      style={{ fontFamily: 'var(--font-display)', background: 'rgba(255, 255, 255, 0.08)', color: 'var(--color-text-primary)' }}>
                      싱크
                    </motion.button>
                    {proj.has_sync && (
                      <>
                        <motion.button whileTap={{ scale: 0.94 }} transition={springSoft}
                          onClick={() => onLoadProject(proj.project_id, 'preview')}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-semibold hidden sm:block"
                          style={{ fontFamily: 'var(--font-display)', background: 'rgba(255, 255, 255, 0.08)', color: 'var(--color-text-primary)' }}>
                          프리뷰
                        </motion.button>
                        <motion.button whileTap={{ scale: 0.94 }} transition={springSoft}
                          onClick={() => onLoadProject(proj.project_id, 'generate')}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-semibold"
                          style={{ fontFamily: 'var(--font-display)', background: '#ffffff', color: '#000' }}>
                          렌더
                        </motion.button>
                      </>
                    )}
                    <motion.button
                      whileTap={{ scale: 0.9 }} transition={springSoft}
                      onClick={(e) => deleteProject(proj.project_id, e)}
                      title="삭제"
                      className="w-8 h-8 rounded-lg flex items-center justify-center opacity-50 hover:opacity-100 transition-all hover:bg-[rgba(244,63,94,0.14)]"
                      style={{ color: 'var(--color-text-muted)' }}>
                      <IconTrash size={16} />
                    </motion.button>
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
