<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" width="110" alt="the rest" />
</p>

<h1 align="center">the rest</h1>

<p align="center"><b>음악 만들기나 해. 나머지는 내가 해줄게.</b><br/>
<sub>Just make music. I'll do the rest.</sub></p>

<p align="center">
  언더그라운드 아티스트를 위한 <b>로컬 퍼스트 데스크톱 툴킷</b> — 비트 받고, 가사 싱크하고, 리릭 비디오 뽑는 것까지 전부 내 PC에서.<br/>
  <sub>A local-first desktop toolkit for underground artists — beats in, lyric videos out, all on your own machine.</sub>
</p>

<p align="center">
  <a href="https://github.com/1nsidewill/the-rest/releases/latest"><img src="https://img.shields.io/github/v/release/1nsidewill/the-rest?display_name=tag&style=flat-square&color=white&labelColor=111" alt="release"/></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%C2%B7%20Windows-white?style=flat-square&labelColor=111" alt="platforms"/>
  <img src="https://img.shields.io/badge/local--first-no%20server%20%C2%B7%20no%20login-white?style=flat-square&labelColor=111" alt="local-first"/>
  <img src="https://img.shields.io/github/license/1nsidewill/the-rest?style=flat-square&color=white&labelColor=111" alt="license"/>
</p>

---

## 🇰🇷 한국어 <sub>([English below](#-english))</sub>

### 미리보기

https://github.com/user-attachments/assets/ab4e6e86-2beb-4767-b332-e23a5e704d62

### 무엇을 하는 앱인가요?

**the rest**는 두 개의 모듈로 이루어져 있습니다. 로그인 없음, 업로드 없음, 서버 없음 — 렌더링·다운로드·변환 전부 **내 컴퓨터에서** 돌아갑니다.

| 모듈 | 하는 일 |
|---|---|
| 🎧 **비트 다운로더** | 유튜브 링크를 붙여넣으면 캡션(제목·설명)에서 **키(Key)와 BPM을 자동 인식**해 파일명까지 정리(`prod.X - Night [140bpm F#m].wav`). WAV · MP3 · FLAC 저장, 받은 비트는 **보관함**에 키·BPM과 함께 기록 |
| 🎬 **리릭 비디오 스튜디오** | 오디오 + 앨범아트 + 가사 → 키보드로 리듬 타며 싱크 → **1080p60 MP4** 렌더. 앨범 색을 따라가는 앰비언트 배경, 음악에 반응하는 EQ 웨이브폼, 타임라인, **9:16 릴스 포맷**까지 |

### 다운로드

최신 설치 파일: **[Releases](https://github.com/1nsidewill/the-rest/releases/latest)**

| OS | 파일 |
|---|---|
| **Windows 10/11** | `The Rest_x.y.z_x64-setup.exe` (권장) 또는 `..._x64_en-US.msi` |
| **macOS (Apple Silicon · M1 이상)** | `The Rest_x.y.z_aarch64.dmg` |

- FFmpeg **내장** — 따로 설치할 것 없음
- 처음 한 번만 수동 설치하면 이후 새 버전은 **앱 안에서 자동 업데이트**
- 렌더 결과물의 오디오는 **원본 음원 그대로**(재인코딩 없이 스트림 복사) 담깁니다

### 설치

**Windows**
1. `.exe` 실행 → 안내에 따라 설치
2. 서명되지 않은 앱이라 SmartScreen이 뜨면 **추가 정보 → 실행**

**macOS**
1. `.dmg` 열고 **The Rest**를 `Applications`로 드래그
2. 처음 실행 시 *"손상되었기 때문에 열 수 없습니다"* 경고가 뜹니다 — 손상이 아니라 다운로드에 붙는 격리(quarantine) 속성 때문입니다. 터미널에서 한 줄:
   ```bash
   /usr/bin/xattr -dr com.apple.quarantine "/Applications/The Rest.app"
   ```
   > ⚠️ 반드시 `/usr/bin/xattr` **전체 경로**로 실행하세요. pyenv/Homebrew의 다른 `xattr`가 PATH를 가리면 `option -r not recognized` 에러가 납니다.

> 코드 서명 인증서 없이 배포되어 위 경고가 나옵니다. 소스가 공개되어 있으니 직접 빌드해도 됩니다 → [Build from source](#build-from-source)

### 리릭 비디오 스튜디오 — 흐름

```
① 업로드          ② 싱크                ③ 프리뷰            ④ 렌더
오디오·아트·가사 →  Space로 리듬 타며   →  실시간 캔버스,     →  GPU H.264 + FFmpeg
(WAV·MP3·FLAC)     타임스탬프 히트        EQ·타임라인 토글      1080p60 MP4
```

- **싱크**: `Space` 히트 · `←` 되돌리기 · `Tab` 건너뛰기 · 줄 클릭 = 그 줄로 이동만(런업 포함, `Space`로만 기록) · 더블클릭 = 가사 수정 · **가사 편집**으로 빠진 줄을 넣어도 기존 싱크는 유지
- **멀티 싱어**: 가사에 `[이름]` 줄을 넣으면 파트별 색상 자동 배정
- **스타일**: 앨범 dominant 컬러 → 앰비언트 배경 + EQ 색 자동 추출 · EQ/타임라인 토글 · 16:9 & 9:16
- **출력**: 1920×1080(또는 1080×1920) · 60fps · H.264 · **원본 음질 오디오** · YouTube 설명란 자동 생성(크레딧 포함)

### 비트 다운로더 — 어떻게 인식하나요?

type beat 캡션의 관례(`"[FREE] Drake Type Beat | 140 BPM | F# minor"`, `[Am 148bpm]`, `Key: Db minor`)를 정규화합니다.

- **BPM**: `bpm` 인접 숫자만, **30–200** 범위로 제한
- **키**: `F# minor`·`Dbm`·`Am` 등 → `F#m`처럼 정규화(플랫→샤프 통일). *"Who Am I"* 같은 영어 단어는 오탐하지 않도록 가드
- 인식 실패 시 직접 입력 가능 · 챕터 타임스탬프(훅 위치 등)도 보관함에 함께 저장
- 엔진은 오픈소스 **yt-dlp**를 최초 1회 받아(약 35MB) 이 PC에서만 실행

> ⚠️ **권리가 있는 콘텐츠만 다운로드하세요.** 다운로드는 전부 사용자의 PC에서 사용자 책임으로 실행되며, 프로듀서의 라이선스 조건(free / free-for-profit 등)을 확인하는 것은 사용자 몫입니다.

### Build from source

```bash
# 요구사항: Node 20+, Rust (stable), npm
git clone https://github.com/1nsidewill/the-rest.git
cd the-rest
npm install
npm run fetch-ffmpeg   # ffmpeg sidecar 준비 (ffmpeg-static)
npm run desktop        # 개발 모드 (네이티브 창)
npm run desktop:build  # 배포 번들 (macOS는 CI=true 필요할 수 있음)
```

### 기술 스택

`Tauri 2` (Rust) · `React 19` + `Vite 7` + `Tailwind v4` + `Framer Motion 12` · `WebCodecs` GPU H.264 · 번들 `FFmpeg` · 커스텀 radix-2 FFT 스펙트로그램 · `tauri-plugin-updater` 서명 자동 업데이트

---

## 🇺🇸 English

### What is this?

**the rest** is a local-first desktop toolkit for underground artists, made of two modules. No login, no upload, no server — rendering, downloading, and conversion all run **on your own machine**.

| Module | What it does |
|---|---|
| 🎧 **Beat Downloader** | Paste a YouTube link and the caption (title + description) is parsed for **key and BPM**, straight into the filename (`prod.X - Night [140bpm F#m].wav`). Saves WAV · MP3 · FLAC and keeps every beat in a **library** with its key/BPM |
| 🎬 **Lyric Video Studio** | Audio + artwork + lyrics → tap timestamps to the beat → render a **1080p60 MP4**. Ambient background tinted from the album art, a music-reactive EQ waveform, a timeline, and a **9:16 Reels format** |

### Download

Latest installers: **[Releases](https://github.com/1nsidewill/the-rest/releases/latest)**

| OS | File |
|---|---|
| **Windows 10/11** | `The Rest_x.y.z_x64-setup.exe` (recommended) or `..._x64_en-US.msi` |
| **macOS (Apple Silicon · M1+)** | `The Rest_x.y.z_aarch64.dmg` |

- FFmpeg is **bundled** — nothing else to install
- Install manually once; new versions arrive via **in-app auto-update**
- Rendered videos carry **source-quality audio** (stream copy, no re-encode)

### Install

**Windows** — run the `.exe`; if SmartScreen appears, click **More info → Run anyway** (the app is unsigned).

**macOS** — drag **The Rest** into `Applications`. On first launch macOS says the app *"is damaged and can't be opened"* — that's the download quarantine flag, not actual damage. Clear it once:

```bash
/usr/bin/xattr -dr com.apple.quarantine "/Applications/The Rest.app"
```

> ⚠️ Use the full `/usr/bin/xattr` path — a pyenv/Homebrew `xattr` shadowing your PATH throws `option -r not recognized`.

### Lyric Video Studio — flow

`① Upload (WAV·MP3·FLAC + PNG·JPG·GIF + lyrics)` → `② Sync (hit Space to the beat)` → `③ Preview (live canvas, EQ/timeline toggles, 16:9/9:16)` → `④ Render (GPU H.264 + bundled FFmpeg)`

- **Sync**: `Space` hit · `←` undo · `Tab` skip · click a line to move there (with a run-up — only `Space` stamps) · double-click to edit its text · the **Edit lyrics** modal lets you add missing lines while keeping existing timings
- **Multi-singer**: `[Name]` lines split parts with per-singer colors
- **Output**: 1920×1080 (or 1080×1920) · 60fps · H.264 · source-quality audio · auto-generated YouTube description with credits

### Beat Downloader — detection

Normalizes the type-beat caption conventions (`"[FREE] Drake Type Beat | 140 BPM | F# minor"`, `[Am 148bpm]`, `Key: Db minor`):

- **BPM**: digits adjacent to "bpm", clamped to **30–200**
- **Key**: `F# minor` / `Dbm` / `Am` → normalized like `F#m` (flats folded to sharps), with guards so English words ("Who **Am** I") don't false-positive
- Manual override when nothing is detected · chapter timestamps are stored with each beat
- The engine is open-source **yt-dlp**, fetched once (~35MB) and run only on this PC

> ⚠️ **Only download content you have the rights to.** Downloads run locally, on your machine and your responsibility; checking each producer's license terms is on you.

### License

MIT © [insidewill](https://github.com/1nsidewill)
