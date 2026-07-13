# 🎵 Lyric Video Studio

> **Offline desktop app** that turns album art + audio + lyrics into a YouTube-ready **1080p60 MP4** lyric video — rendered entirely on your own machine.

앨범아트 · 오디오 · 가사만 있으면 **내 컴퓨터에서 바로** YouTube용 리릭 비디오(1920×1080 · 60fps · H.264)를 만드는 **윈도우/맥 데스크톱 앱**입니다. 로그인도, 업로드도, 서버도 없습니다.

<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" width="128" alt="Lyric Video Studio" />
</p>

## 🎬 Demo / 미리보기

https://github.com/user-attachments/assets/ab4e6e86-2beb-4767-b332-e23a5e704d62

---

## ⬇️ Download / 다운로드

최신 설치 파일은 **[Releases](https://github.com/1nsidewill/lyric-video-studio/releases/latest)** 에서 받으세요.

| OS | 파일 | 비고 |
|---|---|---|
| **Windows 10/11** | `Lyric Video Studio_x.y.z_x64-setup.exe` (NSIS) 또는 `..._x64_en-US.msi` | WebView2 자동 설치 |
| **macOS (Apple Silicon · M1~)** | `Lyric Video Studio_x.y.z_aarch64.dmg` | |
| **macOS (Intel)** | `Lyric Video Studio_x.y.z_x64.dmg` | |

FFmpeg은 앱에 **내장**되어 있어 따로 설치할 필요가 없습니다.

### 설치 방법

**Windows**
1. `.exe`(권장) 또는 `.msi` 실행 → 안내에 따라 설치
2. 서명되지 않은 앱이라 SmartScreen이 뜨면 **추가 정보 → 실행**을 누르세요.

**macOS**
1. `.dmg` 열고 **Lyric Video Studio** 를 `Applications` 로 드래그
2. 서명(공증)되지 않은 앱이라 처음 실행 시 차단될 수 있습니다. 아래 중 하나로 실행하세요:
   - **우클릭(또는 Control-클릭) → 열기 → 열기**, 또는
   - 터미널에서 quarantine 속성 제거:
     ```bash
     xattr -dr com.apple.quarantine "/Applications/Lyric Video Studio.app"
     ```

> 코드 서명 인증서 없이 배포하므로 위 경고가 나옵니다. 소스가 공개되어 있으니 직접 빌드해서 쓰셔도 됩니다(아래 [Build from source](#-build-from-source)).

---

## ✨ Features / 주요 기능

| | |
|---|---|
| 🎨 **Album Art Crop** | 1:1 크롭 도구 내장 |
| 🎵 **Audio Support** | MP3 / WAV / FLAC / OGG / M4A |
| 🖐 **Drag & Drop** | 오디오·이미지 파일을 창에 끌어다 놓기 |
| ⌨️ **Live Lyric Sync** | 키보드로 실시간 타임스탬프 입력 |
| 👤 **Multi-Singer Tags** | `[이름]` 문법으로 자동 파트 구분 · 색상 배지 |
| 🎬 **Realtime Preview** | Canvas 실시간 프리뷰 (seeking 지원) |
| ⚡ **Local GPU Render** | WebCodecs H.264 하드웨어 인코딩 + 내장 FFmpeg mux |
| 📹 **Output** | 1920×1080 · 60fps · H.264 · AAC 320kbps |
| 📋 **YT Description** | YouTube 설명란 자동 생성기 (크레딧 포함) |
| 💾 **Local Projects** | 프로젝트가 내 PC에 저장 · 최근 목록에서 이어서 작업 |

---

## 📖 How to Use / 사용법

### 1. Upload / 업로드
1. **Album Art** 이미지(JPG/PNG)를 올리고 1:1로 크롭
2. **Audio** 파일(MP3/WAV/FLAC…)을 올리기
3. **Lyrics** 가사를 입력 (한 줄 = 한 라인)

> 파일은 창에 **드래그앤드롭**으로도 넣을 수 있어요.

**🎤 Multi-Singer 문법**
```
[Yi Will]
Ben and Jerry's flavor you've got
All my friends 다 안달이 났지

[Halim]
어쩌면 우린 천생연분일지 몰라
```
`[이름]` 으로 시작하는 줄은 싱어 태그로 인식되고, 이후 줄들이 해당 싱어 파트로 지정됩니다.

### 2. Sync / 싱크
노래를 들으면서 키보드로 타이밍을 찍습니다.

| Key | Action |
|-----|--------|
| `Space` | ▶ 재생 / 현재 라인 타임스탬프 커밋 |
| `Backspace` | ↩ 이전 라인 롤백 |
| `Tab` | ⏭ 현재 라인 스킵 |
| `Esc` | ⏸ 일시정지 |

라인 클릭 → 해당 구간 seek · ✏️ 수정 · 🗑 삭제 · **SKIP → PREVIEW** 로 나머지 자동 채우기.

### 3. Preview / 미리보기
`Space` 재생/정지 · `←`/`→` 5초 이동 · 타임라인 클릭·드래그로 seek.

### 4. Render / 렌더
1. (선택) **YouTube Description** 크레딧 입력 → COPY 로 복사
2. **START RENDER** → 저장 위치 선택 → 로컬에서 렌더링
3. 완료 후 **폴더에서 보기 / 영상 열기**

> **렌더 엔진**: WebCodecs(GPU H.264)가 되는 환경에서는 GPU로 인코딩 후 내장 FFmpeg으로 오디오만 mux(재인코딩 없음). 미지원 환경에서는 프레임 시퀀스를 내장 FFmpeg(libx264)으로 인코딩하는 방식으로 자동 전환됩니다.

---

## 🎬 Output Spec

| 항목 | 값 |
|---|---|
| 해상도 | 1920 × 1080 (Full HD) |
| 프레임레이트 | 60fps (fallback 30fps) |
| 비디오 코덱 | H.264 (High Profile) |
| 오디오 코덱 | AAC 320kbps / 48kHz |
| 컨테이너 | MP4 (`+faststart`) |

---

## 🛠 Tech Stack

- **Tauri 2** — Rust 셸 + OS 웹뷰(Windows: WebView2 / macOS: WKWebView), ~수 MB 설치본
- **React 19 + TypeScript + Vite** — UI
- **Tailwind CSS v4 · Framer Motion** — 스타일 · 모션
- **WebCodecs API** — GPU H.264 인코딩
- **Bundled FFmpeg** — 오디오 mux / fallback 인코딩 (Tauri sidecar)
- **Pretendard** — 번들 폰트 (오프라인)

프로젝트/미디어는 OS의 앱 데이터 폴더(`$APPLOCALDATA/projects/…`)에 저장되고, 렌더 결과는 사용자가 지정한 위치에 저장됩니다.

---

## 🧑‍💻 Build from source

### Prerequisites
- **Node.js 18+**
- **Rust** (stable) — https://rustup.rs
- 플랫폼별 Tauri 사전 요구사항: https://tauri.app/start/prerequisites/
  - Windows: **WebView2**(Win11 기본 내장) + MSVC Build Tools
  - macOS: **Xcode Command Line Tools** (`xcode-select --install`)

### Run (dev)
```bash
git clone https://github.com/1nsidewill/lyric-video-studio.git
cd lyric-video-studio
npm install
npm run fetch-ffmpeg   # 플랫폼용 FFmpeg 사이드카를 src-tauri/binaries/ 에 배치
npm run desktop        # = tauri dev (네이티브 창 실행)
```

### Build (production)
```bash
npm run fetch-ffmpeg
npm run desktop:build  # = tauri build → src-tauri/target/release/bundle/ 에 설치본 생성
```

> macOS에서 DMG 생성 단계(`bundle_dmg.sh`)가 Finder 접근 없이 실패하면 `CI=true npm run desktop:build` 로 실행하세요 (창 레이아웃 스크립트를 건너뜁니다). `.app` 자체는 항상 생성됩니다.

> `src-tauri/binaries/` 의 FFmpeg 바이너리는 플랫폼별이라 커밋되지 않습니다. `npm run fetch-ffmpeg` 가 [`ffmpeg-static`](https://www.npmjs.com/package/ffmpeg-static) 에서 현재 OS용 정적 바이너리를 받아 Tauri sidecar 이름으로 배치합니다. Windows/macOS 릴리스는 [GitHub Actions](.github/workflows/release.yml) 가 태그 푸시(`v*`) 시 자동 빌드합니다.

---

## 📁 Project Structure

```
lyric-video-studio/
├── src/                     # React 프론트엔드
│   ├── components/          # FileUpload · LyricSync · Preview · Generate …
│   ├── lib/
│   │   ├── storage.ts       # 로컬 프로젝트 CRUD (Tauri fs + asset protocol)
│   │   └── render.ts        # 캔버스 인코딩 → 임시파일 → Rust ffmpeg 커맨드
│   └── utils/canvasRenderer.ts   # 프리뷰·렌더 공용 프레임 엔진
├── src-tauri/               # Tauri (Rust) 셸
│   ├── src/render.rs         # ffmpeg sidecar mux/encode + 진행률 이벤트
│   ├── binaries/             # FFmpeg 사이드카 (git-ignored, fetch-ffmpeg 로 생성)
│   ├── capabilities/         # fs/dialog/shell/opener 권한 (앱 데이터로 스코프)
│   └── tauri.conf.json
└── .github/workflows/release.yml   # Win + macOS 빌드/릴리스
```

---

## 📄 License

MIT License © [insidewill](https://github.com/1nsidewill)

Made with ❤️ — open source, free to use.
