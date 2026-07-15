/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type Lang = 'ko' | 'en';
const LS_KEY = 'therest.lang';

// ─── Korean (primary) ────────────────────────────────────────────────────────
const ko = {
  // Shell / rail
  'nav.home': '홈',
  'nav.downloader': '다운로더',
  'nav.studio': '스튜디오',
  'nav.lang': 'EN',

  // Home
  'home.tagline': '음악 만들기나 해. 나머지는 내가 해줄게.',
  'home.downloader.title': '비트 다운로더',
  'home.downloader.desc': '유튜브 비트를 무손실로 · 키·BPM 자동 태깅 · 보관함',
  'home.studio.title': '리릭 비디오 스튜디오',
  'home.studio.desc': '가사 싱크부터 리액티브 EQ, 렌더까지 — 전부 이 PC에서',
  'home.open': '열기',

  // Studio steps
  'step.upload': '업로드',
  'step.sync': '싱크',
  'step.preview': '프리뷰',
  'step.render': '렌더',

  // Upload
  'up.tagline': '음악과 가사를 올리고 · 리듬에 맞춰 싱크하고 · 리릭비디오를 만드세요',
  'up.drop.title': '여기에 놓으세요',
  'up.drop.desc': '오디오 (WAV · MP3 · FLAC) 또는 앨범아트 (PNG · JPG · GIF)',
  'up.audio': '오디오 파일',
  'up.audio.ready': '오디오 준비됨',
  'up.art': '앨범아트',
  'up.art.upload': '업로드',
  'up.art.or': '또는 기본 아트',
  'up.art.cropped': '크롭 완료',
  'up.art.default': '기본 아트',
  'up.art.change': '변경',
  'up.meta.title': '곡 제목',
  'up.meta.artist': '아티스트',
  'up.meta.album': '앨범명 (선택)',
  'up.lyrics': '가사',
  'up.tip.1': '태그로 파트를 구분할 수 있어요.',
  'up.tip.2': '파트마다 다른 색으로 표시됩니다',
  'up.lyrics.ph': '[가수이름]\n첫 번째 줄 가사\n두 번째 줄 가사\n\n[다른가수]\n세 번째 줄 가사…',
  'up.lines': '{n}줄',
  'up.submit': '싱크 시작',
  'up.making': '만드는 중…',
  'up.recent': '최근 프로젝트',
  'up.recent.empty': '아직 프로젝트가 없어요',
  'up.recent.sync': '싱크',
  'up.recent.preview': '프리뷰',
  'up.recent.render': '렌더',
  'up.recent.synced': '싱크됨',
  'up.recent.delete': '삭제',

  // Sync
  'sync.kbd.hit': '히트',
  'sync.kbd.play': '재생',
  'sync.kbd.undo': '되돌리기',
  'sync.kbd.stop': '정지',
  'sync.kbd.skip': '건너뛰기',
  'sync.hint': '· 클릭=재조정 · 더블클릭=한 줄 수정',
  'sync.lines': '줄 기록',
  'sync.done': '{p}% 완료',
  'sync.play': '재생',
  'sync.pause': '일시정지',
  'sync.editAll': '가사 편집',
  'sync.skip': '건너뛰기',
  'sync.complete': '완료 · 프리뷰로',
  'sync.edit': '편집',
  'sync.delete': '삭제',
  'sync.dbl': '더블클릭해서 가사 수정',
  'sync.editDesc': '빠진 줄을 추가하거나 순서를 바꿔도, 가사가 그대로인 줄은 맞춰둔 싱크가 그대로 유지돼요. 새로 추가한 줄만 다시 맞추면 됩니다.',
  'sync.editDesc2': '줄로 파트를 나눌 수 있어요.',
  'sync.editCount': '{n}줄 · ⌘/Ctrl+Enter 저장',
  'sync.cancel': '취소',
  'sync.save': '저장',

  // Preview
  'pv.title': '프리뷰',
  'pv.hint': 'Space 재생/정지 · ← → 5초 이동 · 타임라인 드래그로 탐색',
  'pv.timeline': '타임라인',
  'pv.reels': '9:16 릴스',
  'pv.toSync': '싱크로',
  'pv.toRender': '렌더로',

  // Render
  'rd.title': '렌더',
  'rd.local': '100% 로컬 렌더 · GPU H.264 · 번들 FFmpeg',
  'rd.aspect.h': '16:9 가로',
  'rd.aspect.v': '9:16 세로 · 릴스',
  'rd.audio.lossless': '원본 음질 그대로',
  'rd.start': '렌더 시작',
  'rd.preview': '프리뷰',
  'rd.sync': '싱크',
  'rd.cancel': '취소',
  'rd.stage.preparing': '준비 중 · 앨범아트/오디오 로딩',
  'rd.stage.encoding': '프레임 렌더링 · GPU 인코딩',
  'rd.stage.finalizing': 'FFmpeg 먹싱 · 마무리',
  'rd.wait': '잠시만 기다려 주세요',
  'rd.doneTitle': '완성됐어요',
  'rd.reveal': '폴더에서 보기',
  'rd.open': '영상 열기',
  'rd.again': '다시',
  'rd.failed': '렌더 실패',
  'rd.retry': '다시 시도',
  'rd.ytdesc': 'YouTube 설명',
  'rd.gen': '생성된 설명',
  'rd.copy': '복사',
  'rd.copied': '복사됨',
  'rd.saveTitle': '리릭 비디오 저장',

  // Cropper
  'crop.title': '앨범아트 자르기 · 1:1',
  'crop.hint': '드래그로 이동 · 스크롤로 크기 조절',
  'crop.cancel': '취소',
  'crop.apply': '적용',

  // Update banner
  'ub.new': '새 버전 {v}',
  'ub.sub': '지금 설치하고 재시작할 수 있어요',
  'ub.install': '설치',
  'ub.later': '나중에',
  'ub.downloading': '업데이트 다운로드 중 · {p}%',
  'ub.ready': '설치 완료 · 재시작 중…',
  'ub.error': '업데이트를 완료하지 못했어요',
  'ub.close': '닫기',

  // Downloader
  'dl.title': '비트 다운로더',
  'dl.sub': '유튜브 링크를 붙여넣으면 키·BPM을 읽어 파일명까지 정리해요',
  'dl.fetch': '불러오기',
  'dl.fetching': '읽는 중…',
  'dl.engine.title': '다운로드 엔진이 필요해요',
  'dl.engine.desc': '오픈소스 yt-dlp 바이너리를 받아 이 PC에서만 사용해요 (최초 1회 · 약 35MB)',
  'dl.engine.install': '엔진 설치',
  'dl.engine.installing': '설치 중…',
  'dl.key': '키',
  'dl.bpm': 'BPM',
  'dl.detected': '캡션에서 자동 인식됨',
  'dl.notfound': '자동 인식 실패 — 직접 입력할 수 있어요',
  'dl.format': '포맷',
  'dl.folder': '저장 폴더',
  'dl.choose': '폴더 선택',
  'dl.download': '다운로드',
  'dl.downloading': '다운로드 중',
  'dl.converting': '변환 중…',
  'dl.saved': '저장됨',
  'dl.library': '보관함',
  'dl.empty': '아직 받은 비트가 없어요.\n링크를 붙여넣고 첫 비트를 저장해 보세요.',
  'dl.reveal': '폴더에서 보기',
  'dl.filename': '파일명',
  'dl.error': '실패',
  'dl.disclaimer': '권리가 있는 콘텐츠만 받으세요 · 다운로드는 전부 이 PC에서 실행됩니다',
} as const;

export type DictKey = keyof typeof ko;

// ─── English ─────────────────────────────────────────────────────────────────
const en: Record<DictKey, string> = {
  'nav.home': 'Home',
  'nav.downloader': 'Downloader',
  'nav.studio': 'Studio',
  'nav.lang': '한국어',

  'home.tagline': 'Just make music. I’ll do the rest.',
  'home.downloader.title': 'Beat Downloader',
  'home.downloader.desc': 'Lossless beats from YouTube · auto key & BPM tags · library',
  'home.studio.title': 'Lyric Video Studio',
  'home.studio.desc': 'Sync lyrics, reactive EQ, render — all on this PC',
  'home.open': 'Open',

  'step.upload': 'Upload',
  'step.sync': 'Sync',
  'step.preview': 'Preview',
  'step.render': 'Render',

  'up.tagline': 'Drop your track and lyrics · tap to the beat · render a lyric video',
  'up.drop.title': 'Drop it here',
  'up.drop.desc': 'Audio (WAV · MP3 · FLAC) or artwork (PNG · JPG · GIF)',
  'up.audio': 'Audio file',
  'up.audio.ready': 'Audio ready',
  'up.art': 'Artwork',
  'up.art.upload': 'Upload',
  'up.art.or': 'or pick a default',
  'up.art.cropped': 'Cropped',
  'up.art.default': 'Default art',
  'up.art.change': 'Change',
  'up.meta.title': 'Track title',
  'up.meta.artist': 'Artist',
  'up.meta.album': 'Album (optional)',
  'up.lyrics': 'Lyrics',
  'up.tip.1': 'tags split singer parts.',
  'up.tip.2': 'Each part gets its own color',
  'up.lyrics.ph': '[Singer]\nFirst lyric line\nSecond lyric line\n\n[Another singer]\nThird lyric line…',
  'up.lines': '{n} lines',
  'up.submit': 'Start syncing',
  'up.making': 'Creating…',
  'up.recent': 'Recent projects',
  'up.recent.empty': 'No projects yet',
  'up.recent.sync': 'Sync',
  'up.recent.preview': 'Preview',
  'up.recent.render': 'Render',
  'up.recent.synced': 'Synced',
  'up.recent.delete': 'Delete',

  'sync.kbd.hit': 'Hit',
  'sync.kbd.play': 'Play',
  'sync.kbd.undo': 'Undo',
  'sync.kbd.stop': 'Pause',
  'sync.kbd.skip': 'Skip',
  'sync.hint': '· click = re-adjust · double-click = edit line',
  'sync.lines': 'lines set',
  'sync.done': '{p}% done',
  'sync.play': 'Play',
  'sync.pause': 'Pause',
  'sync.editAll': 'Edit lyrics',
  'sync.skip': 'Skip',
  'sync.complete': 'Done · to preview',
  'sync.edit': 'Edit',
  'sync.delete': 'Delete',
  'sync.dbl': 'Double-click to edit this line',
  'sync.editDesc': 'Add missing lines or reorder freely — lines whose text is unchanged keep their timing. Only new lines need syncing.',
  'sync.editDesc2': 'lines split singer parts.',
  'sync.editCount': '{n} lines · ⌘/Ctrl+Enter to save',
  'sync.cancel': 'Cancel',
  'sync.save': 'Save',

  'pv.title': 'Preview',
  'pv.hint': 'Space play/pause · ← → skip 5s · drag the timeline to seek',
  'pv.timeline': 'Timeline',
  'pv.reels': '9:16 Reels',
  'pv.toSync': 'To sync',
  'pv.toRender': 'To render',

  'rd.title': 'Render',
  'rd.local': '100% local render · GPU H.264 · bundled FFmpeg',
  'rd.aspect.h': '16:9 Landscape',
  'rd.aspect.v': '9:16 Portrait · Reels',
  'rd.audio.lossless': 'Source-quality audio',
  'rd.start': 'Start render',
  'rd.preview': 'Preview',
  'rd.sync': 'Sync',
  'rd.cancel': 'Cancel',
  'rd.stage.preparing': 'Preparing · loading art & audio',
  'rd.stage.encoding': 'Rendering frames · GPU encoding',
  'rd.stage.finalizing': 'FFmpeg muxing · finishing',
  'rd.wait': 'hang tight',
  'rd.doneTitle': 'Done!',
  'rd.reveal': 'Show in folder',
  'rd.open': 'Open video',
  'rd.again': 'Again',
  'rd.failed': 'Render failed',
  'rd.retry': 'Try again',
  'rd.ytdesc': 'YouTube description',
  'rd.gen': 'Generated description',
  'rd.copy': 'Copy',
  'rd.copied': 'Copied',
  'rd.saveTitle': 'Save lyric video',

  'crop.title': 'Crop artwork · 1:1',
  'crop.hint': 'drag to move · scroll to resize',
  'crop.cancel': 'Cancel',
  'crop.apply': 'Apply',

  'ub.new': 'Version {v} available',
  'ub.sub': 'Install now and relaunch',
  'ub.install': 'Install',
  'ub.later': 'Later',
  'ub.downloading': 'Downloading update · {p}%',
  'ub.ready': 'Installed · relaunching…',
  'ub.error': 'Couldn’t finish the update',
  'ub.close': 'Close',

  'dl.title': 'Beat Downloader',
  'dl.sub': 'Paste a YouTube link — key & BPM get parsed straight into the filename',
  'dl.fetch': 'Fetch',
  'dl.fetching': 'Reading…',
  'dl.engine.title': 'Download engine required',
  'dl.engine.desc': 'Fetches the open-source yt-dlp binary, used only on this PC (one-time · ~35MB)',
  'dl.engine.install': 'Install engine',
  'dl.engine.installing': 'Installing…',
  'dl.key': 'Key',
  'dl.bpm': 'BPM',
  'dl.detected': 'Auto-detected from the caption',
  'dl.notfound': 'Not detected — you can type it in',
  'dl.format': 'Format',
  'dl.folder': 'Save folder',
  'dl.choose': 'Choose folder',
  'dl.download': 'Download',
  'dl.downloading': 'Downloading',
  'dl.converting': 'Converting…',
  'dl.saved': 'Saved',
  'dl.library': 'Library',
  'dl.empty': 'No beats yet.\nPaste a link and save your first one.',
  'dl.reveal': 'Show in folder',
  'dl.filename': 'Filename',
  'dl.error': 'Failed',
  'dl.disclaimer': 'Only download content you have rights to · everything runs locally on this PC',
};

const dicts: Record<Lang, Record<DictKey, string>> = { ko, en };

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: DictKey, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() =>
    localStorage.getItem(LS_KEY) === 'en' ? 'en' : 'ko');
  const setLang = (l: Lang) => { localStorage.setItem(LS_KEY, l); setLangState(l); };
  const value = useMemo<I18n>(() => ({
    lang,
    setLang,
    t: (k, vars) => {
      let s: string = dicts[lang][k] ?? ko[k] ?? k;
      if (vars) for (const [key, v] of Object.entries(vars)) s = s.replaceAll(`{${key}}`, String(v));
      return s;
    },
  }), [lang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const c = useContext(Ctx);
  if (!c) throw new Error('useI18n must be used inside I18nProvider');
  return c;
}
