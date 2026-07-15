import { useState, useRef, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ImageCropper from './ImageCropper';
import { createProject, listProjects, deleteProject as removeProject } from '../lib/storage';
import { springSoft } from '../lib/motion';
import { useI18n } from '../lib/i18n';
import { IconMusic, IconImage, IconCheck, IconTrash, IconArrowRight, IconUpload } from './icons';
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

// Locked-down formats: lossless-friendly audio, standard image types.
const AUDIO_EXTS = ['wav', 'mp3', 'flac'];
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

interface Props {
  onUploadComplete: (projectId: string) => void;
  onLoadProject?: (projectId: string, step: AppStep) => void;
}

const stagger = { animate: { transition: { staggerChildren: 0.05 } } };
const fadeUp = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
};

export default function FileUpload({ onUploadComplete, onLoadProject }: Props) {
  const { t } = useI18n();
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
    if (AUDIO_EXTS.includes(ext)) {
      setAudioFile(file);
    } else if (IMAGE_EXTS.includes(ext)) {
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
    <div className="relative h-full min-h-0"
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
                {t('up.drop.title')}
              </p>
              <p className="text-xs mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
                {t('up.drop.desc')}
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

      <motion.div className="h-full min-h-0 grid grid-cols-[1fr_310px] gap-6 px-8 py-6 max-w-6xl mx-auto w-full"
        variants={stagger} initial="initial" animate="animate">
        {/* ── Left: creation form ─────────────────────────────── */}
        <div className="min-h-0 flex flex-col">
          {/* Compact hero */}
          <motion.div variants={fadeUp} className="flex items-end justify-between mb-4 shrink-0">
            <div>
              <h1 className="text-[1.7rem] leading-none font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                {t('home.studio.title')}
              </h1>
              <p className="text-xs mt-1.5" style={{ color: 'var(--color-text-muted)' }}>{t('up.tagline')}</p>
            </div>
            <div className="flex gap-1.5 pb-1">
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
          <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 mb-3 shrink-0">
            {/* Audio */}
            <motion.div
              whileHover={{ scale: 1.01, y: -1 }} whileTap={{ scale: 0.99 }} transition={springSoft}
              onClick={() => audioInputRef.current?.click()}
              className="glass glass-hover rounded-2xl px-5 py-4 cursor-pointer relative overflow-hidden">
              <input ref={audioInputRef} type="file" accept=".wav,.mp3,.flac" className="hidden"
                onChange={e => setAudioFile(e.target.files?.[0] || null)} />
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center"
                  style={{ background: audioFile ? '#ffffff' : 'rgba(255,255,255,0.07)', color: audioFile ? '#000' : 'var(--color-text-secondary)' }}>
                  {audioFile ? <IconCheck size={20} /> : <IconMusic size={20} />}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                    {audioFile ? t('up.audio.ready') : t('up.audio')}
                  </p>
                  <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }} title={audioFile?.name}>
                    {audioFile ? audioFile.name : 'WAV · MP3 · FLAC'}
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Artwork */}
            <div className="glass rounded-2xl px-5 py-4 relative overflow-hidden">
              <input ref={artInputRef} type="file" accept=".png,.jpg,.jpeg,.gif,.webp" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) { setSelectedDefault(null); handleArtworkSelected(f); }}} />
              {artPreview ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3.5">
                  <img src={artPreview} className="w-10 h-10 object-cover rounded-xl shrink-0" alt="artwork"
                    style={{ boxShadow: '0 4px 14px rgba(0,0,0,0.4)' }} />
                  <div className="min-w-0">
                    <p className="font-semibold text-sm tracking-tight inline-flex items-center gap-1" style={{ fontFamily: 'var(--font-display)' }}>
                      <IconCheck size={13} /> {selectedDefault ? t('up.art.default') : t('up.art.cropped')}
                    </p>
                    <button onClick={(e) => { e.stopPropagation(); artInputRef.current?.click(); }}
                      className="block text-[10px] mt-0.5 opacity-50 hover:opacity-90 transition-opacity"
                      style={{ color: 'var(--color-text-secondary)' }}>
                      {t('up.art.change')}
                    </button>
                  </div>
                </motion.div>
              ) : (
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center"
                    style={{ background: 'rgba(255,255,255,0.07)', color: 'var(--color-text-secondary)' }}>
                    <IconImage size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>{t('up.art')}</p>
                      <motion.button whileTap={{ scale: 0.96 }} transition={springSoft}
                        onClick={() => artInputRef.current?.click()}
                        className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(255, 255, 255, 0.08)', color: 'var(--color-text-primary)' }}>
                        <IconUpload size={11} /> {t('up.art.upload')}
                      </motion.button>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>{t('up.art.or')}</span>
                      {DEFAULT_ARTS.map(da => (
                        <motion.button key={da.id}
                          whileHover={{ scale: 1.15, y: -1 }} whileTap={{ scale: 0.92 }} transition={springSoft}
                          onClick={() => selectDefaultArt(da.url, da.id)}
                          className="w-5.5 h-5.5 w-[22px] h-[22px] rounded-md overflow-hidden"
                          style={{ outline: selectedDefault === da.id ? '2px solid #fff' : '1px solid rgba(255,255,255,0.1)' }}>
                          <img src={da.url} alt={da.label} className="w-full h-full object-cover" />
                        </motion.button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>

          {/* Meta inputs */}
          <motion.div variants={fadeUp} className="grid grid-cols-3 gap-3 mb-3 shrink-0">
            <input type="text" placeholder={t('up.meta.title')} value={title} onChange={e => setTitle(e.target.value)}
              className="glass rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-white/25 transition-all placeholder:text-[var(--color-text-muted)]"
              style={{ fontFamily: 'var(--font-body)' }} />
            <input type="text" placeholder={t('up.meta.artist')} value={artist} onChange={e => setArtist(e.target.value)}
              className="glass rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-white/25 transition-all placeholder:text-[var(--color-text-muted)]"
              style={{ fontFamily: 'var(--font-body)' }} />
            <input type="text" placeholder={t('up.meta.album')} value={album} onChange={e => setAlbum(e.target.value)}
              className="glass rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-white/25 transition-all placeholder:text-[var(--color-text-muted)]"
              style={{ fontFamily: 'var(--font-body)' }} />
          </motion.div>

          {/* Lyrics — fills remaining height */}
          <motion.div variants={fadeUp} className="flex-1 min-h-0 flex flex-col mb-3">
            <div className="flex justify-between items-center mb-1.5 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] tracking-[0.15em] uppercase font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text-secondary)' }}>
                  {t('up.lyrics')}
                </span>
                <div className="relative group">
                  <span className="text-[10px] px-1.5 py-0.5 rounded cursor-help"
                    style={{ background: 'rgba(255, 255, 255, 0.08)', color: 'var(--color-text-secondary)' }}>
                    TIP
                  </span>
                  <div className="absolute left-0 top-full mt-1.5 w-60 p-3 rounded-xl text-[11px] leading-relaxed opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 glass-strong"
                    style={{ color: 'var(--color-text-secondary)' }}>
                    <span className="font-semibold" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>[Singer]</span> {t('up.tip.1')}<br/>
                    <span className="block mt-1.5 opacity-50">{t('up.tip.2')}</span>
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
                    {t('up.lines', { n: lineCount })}
                  </span>
                )}
              </div>
            </div>
            <textarea
              placeholder={t('up.lyrics.ph')}
              value={lyrics} onChange={e => setLyrics(e.target.value)}
              className="flex-1 min-h-0 w-full glass rounded-xl px-4 py-3 text-sm leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-white/25 transition-all placeholder:text-[var(--color-text-muted)]"
              style={{ fontFamily: 'var(--font-body)', fontSize: '13px' }} />
          </motion.div>

          {/* Submit */}
          <motion.div variants={fadeUp} className="shrink-0">
            <motion.button
              whileHover={canSubmit ? { scale: 1.005, y: -1 } : {}}
              whileTap={canSubmit ? { scale: 0.99 } : {}}
              transition={springSoft}
              onClick={handleSubmit} disabled={!canSubmit || uploading}
              className="w-full py-3.5 rounded-2xl font-semibold text-[15px] tracking-tight transition-colors disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
                  {t('up.making')}
                </>
              ) : (
                <>{t('up.submit')} <span className="opacity-40 tabular-nums text-sm">{readyCount}/3</span> <IconArrowRight size={18} /></>
              )}
            </motion.button>
          </motion.div>
        </div>

        {/* ── Right: recent projects panel ─────────────────────── */}
        <motion.div variants={fadeUp} className="min-h-0 flex flex-col">
          <div className="flex items-center gap-2 mb-2.5 px-1 shrink-0">
            <h3 className="text-[11px] font-semibold tracking-[0.15em] uppercase" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text-secondary)' }}>
              {t('up.recent')}
            </h3>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full tabular-nums"
              style={{ background: 'rgba(255, 255, 255, 0.06)', color: 'var(--color-text-muted)' }}>
              {recentProjects.length}
            </span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
            {recentProjects.map((proj, i) => (
              <motion.div
                key={proj.project_id}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.03 * i, ...springSoft }}
                className="glass glass-hover rounded-2xl p-3 group">
                <div className="flex items-center gap-2.5">
                  {proj.artwork_src ? (
                    <img src={proj.artwork_src} alt=""
                      className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                      onError={e => (e.currentTarget.style.display = 'none')} />
                  ) : (
                    <div className="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-muted)' }}>
                      <IconMusic size={16} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-xs truncate tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                      {proj.title}
                    </p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[10px] truncate" style={{ color: 'var(--color-text-secondary)' }}>{proj.artist}</span>
                      {proj.has_sync && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full"
                          style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--color-text-secondary)' }}>
                          <IconCheck size={9} /> {t('up.recent.synced')}
                        </span>
                      )}
                    </div>
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.9 }} transition={springSoft}
                    onClick={(e) => deleteProject(proj.project_id, e)}
                    title={t('up.recent.delete')}
                    className="w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-[rgba(244,63,94,0.14)]"
                    style={{ color: 'var(--color-text-muted)' }}>
                    <IconTrash size={14} />
                  </motion.button>
                </div>
                {onLoadProject && (
                  <div className="flex items-center gap-1 mt-2">
                    <motion.button whileTap={{ scale: 0.94 }} transition={springSoft}
                      onClick={() => onLoadProject(proj.project_id, 'sync')}
                      className="flex-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold"
                      style={{ fontFamily: 'var(--font-display)', background: 'rgba(255, 255, 255, 0.08)', color: 'var(--color-text-primary)' }}>
                      {t('up.recent.sync')}
                    </motion.button>
                    {proj.has_sync && (
                      <>
                        <motion.button whileTap={{ scale: 0.94 }} transition={springSoft}
                          onClick={() => onLoadProject(proj.project_id, 'preview')}
                          className="flex-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold"
                          style={{ fontFamily: 'var(--font-display)', background: 'rgba(255, 255, 255, 0.08)', color: 'var(--color-text-primary)' }}>
                          {t('up.recent.preview')}
                        </motion.button>
                        <motion.button whileTap={{ scale: 0.94 }} transition={springSoft}
                          onClick={() => onLoadProject(proj.project_id, 'generate')}
                          className="flex-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold"
                          style={{ fontFamily: 'var(--font-display)', background: '#ffffff', color: '#000' }}>
                          {t('up.recent.render')}
                        </motion.button>
                      </>
                    )}
                  </div>
                )}
              </motion.div>
            ))}
            {recentProjects.length === 0 && (
              <p className="text-[11px] text-center pt-10" style={{ color: 'var(--color-text-muted)' }}>{t('up.recent.empty')}</p>
            )}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
