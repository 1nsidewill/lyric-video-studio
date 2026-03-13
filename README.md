# 🎵 Lyric Video Studio

> **lyric-video-studio** — Browser-based lyric video generator that produces YouTube-ready 1080p60 MP4 files from your album art, audio, and lyrics.

앨범아트 + 오디오 + 가사만 있으면, 브라우저에서 바로 YouTube용 리릭 비디오(1080p 60fps MP4)를 만들 수 있는 웹 애플리케이션입니다.


https://github.com/user-attachments/assets/ab4e6e86-2beb-4767-b332-e23a5e704d62


---

## ✨ Features / 주요 기능

| | |
|---|---|
| 🎨 **Album Art Crop** | 1:1 크롭 도구 내장 |
| 🎵 **Audio Support** | MP3 / WAV |
| ⌨️ **Live Lyric Sync** | 키보드로 실시간 타임스탬프 입력 |
| 👤 **Multi-Singer Tags** | `[Name]` 문법으로 자동 파트 구분, 색상 배지 |
| 🎬 **Preview** | 실시간 Canvas 프리뷰 (seeking 지원) |
| ⚡ **GPU Render** | WebCodecs H.264 하드웨어 인코딩 |
| 📹 **Output** | 1920×1080 · 60fps · H.264 · AAC 320kbps |
| 📋 **YT Description** | YouTube 설명란 자동 생성기 (크레딧 포함) |
| 💾 **Project History** | 최근 3개 프로젝트 자동 저장 |

---

## 🛠 Tech Stack

### Backend
| | |
|---|---|
| **FastAPI** | Python web framework |
| **FFmpeg** | Audio muxing (video → MP4) |
| **uv** | Python package manager |
| **WebSocket** | Frame streaming (browser → FFmpeg) |

### Frontend
| | |
|---|---|
| **React 18 + TypeScript** | UI framework |
| **Vite** | Build tool |
| **Tailwind CSS v4** | Styling |
| **Framer Motion** | Animations |
| **WebCodecs API** | GPU-accelerated H.264 encoding |
| **Web Audio API** | In-browser audio playback |
| **HTML Canvas 2D** | Frame rendering (preview & render share same engine) |

---

## 🚀 Quick Start

### Requirements / 사전 준비

- **Python 3.11+** with [uv](https://docs.astral.sh/uv/)
- **Node.js 18+** with npm
- **FFmpeg** installed and on `PATH`

```bash
# Check FFmpeg
ffmpeg -version
```

---

### 1. Clone & Setup

```bash
git clone https://github.com/insidewill/lyric-video-studio.git
cd lyric-video-studio
```

### 2. Backend

```bash
cd backend

# Copy and edit environment variables
cp .env.example .env

uv sync
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

백엔드가 `http://localhost:8000` 에서 실행됩니다.

### 3. Frontend

```bash
# 새 터미널에서 / In a new terminal
cd frontend
npm install
npm run dev
```

프론트엔드가 `http://localhost:5173` 에서 실행됩니다.

브라우저에서 `http://localhost:5173` 접속 후 사용하면 됩니다.

---

## ⚙️ Environment Variables

백엔드는 `backend/.env` 파일로 설정합니다. `backend/.env.example` 을 복사해서 사용하세요.

```bash
cp backend/.env.example backend/.env
```

| Variable | Default | Description |
|---|---|---|
| `APP_ENV` | `development` | 실행 환경 (`development` \| `production`) |
| `UPLOAD_DIR` | `uploads` | 업로드 파일 저장 디렉토리 (오디오, 앨범아트 등) |
| `OUTPUT_DIR` | `output` | 렌더된 MP4 파일 출력 디렉토리 |
| `MAX_UPLOAD_SIZE_MB` | `100` | 파일 업로드 최대 허용 크기 (MB) |
| `CORS_ORIGINS` | `http://localhost:5173` | 허용할 프론트엔드 Origin (쉼표로 여러 개 구분) |

**프로덕션 배포 예시:**

```env
APP_ENV=production
UPLOAD_DIR=/var/data/lyric-studio/uploads
OUTPUT_DIR=/var/data/lyric-studio/output
MAX_UPLOAD_SIZE_MB=500
CORS_ORIGINS=https://your-domain.com,https://www.your-domain.com
```

---

## 📖 How to Use / 사용 방법

### Step 1 — Upload / 업로드

1. **Album Art** 이미지 업로드 (JPG/PNG) — 1:1 크롭 도구로 정사각형으로 자르기
2. **Audio** 파일 업로드 (MP3 또는 WAV)
3. **Lyrics** 텍스트 박스에 가사 입력 (한 줄 = 한 라인)

**🎤 Multi-Singer 문법:**
```
[Yi Will]
Ben and Jerry's flavor you've got
All my friends 다 안달이 났지

[Halim]
어쩌면 우린 천생연분일지 몰라
I just wait for you online
```
`[이름]` 으로 시작하는 줄은 싱어 태그로 인식되며, 이후 줄들은 해당 싱어 파트로 자동 지정됩니다. 각 싱어는 고유한 색상 배지로 표시됩니다.

---

### Step 2 — Lyric Sync / 가사 싱크

노래를 들으면서 키보드로 가사 타이밍을 찍습니다.

| Key | Action |
|-----|--------|
| `Space` | ▶ 재생 시작 / 현재 가사 라인 타임스탬프 커밋 |
| `Backspace` | ↩ 이전 라인으로 롤백 |
| `Tab` | ⏭ 현재 라인 스킵 (타임스탬프 없이 넘기기) |
| `Esc` | ⏸ 일시정지 |

**기타 기능:**
- 가사 라인 클릭 → 해당 구간으로 seek
- 프로그레스 바 클릭 → 원하는 위치로 seek
- 라인 우측 ✏️ → 가사 내용 직접 수정
- 라인 우측 🗑 → 해당 라인 삭제
- **SKIP TO PREVIEW** → 나머지 라인 자동 채워서 프리뷰로 이동

---

### Step 3 — Preview / 미리보기

실시간으로 완성된 영상 모습을 확인합니다.

| Key / Action | 기능 |
|---|---|
| `Space` | 재생 / 일시정지 |
| `←` / `→` | 5초 앞뒤 이동 |
| 타임라인 클릭 | 해당 위치로 seek |
| 타임라인 드래그 | 연속 seek |

---

### Step 4 — Render / 렌더

1. **YouTube Description** 우측 입력창에 Producer, Composer 등 크레딧 입력 (쉼표로 구분 → 배지로 표시)
2. **START RENDER** 버튼 클릭
3. 렌더 완료 후 파일명 수정 가능 (기본값: `Artist - Title (Lyric Video)`)
4. **DOWNLOAD MP4** 버튼으로 다운로드

> **렌더 엔진**: Chrome/Edge에서는 WebCodecs GPU 하드웨어 인코딩 (빠름), 그 외 브라우저에서는 Raw RGBA 소프트웨어 방식으로 자동 전환됩니다.

---

## 🎬 Output Spec

| 항목 | 값 |
|---|---|
| 해상도 | 1920 × 1080 (Full HD) |
| 프레임레이트 | 60fps |
| 비디오 코덱 | H.264 (High Profile) |
| 오디오 코덱 | AAC 320kbps / 48kHz |
| 컨테이너 | MP4 |
| 용도 | YouTube, Vimeo 업로드 최적화 |

---

## 🚢 Production Deployment (Docker + Cloudflare Tunnel)

Ubuntu 서버에 Docker Compose + Cloudflare Tunnel로 배포하는 방법입니다.

### 사전 준비

```bash
# Ubuntu 서버에서
sudo apt update && sudo apt install -y docker.io docker-compose-v2
sudo usermod -aG docker $USER
```

### 1. 서버에 클론

```bash
cd /srv/app
git clone https://github.com/1nsidewill/lyric-video-studio.git
cd lyric-video-studio
```

### 2. 환경 변수 설정

```bash
# 루트 .env — Cloudflare Tunnel 토큰
cp .env.example .env
nano .env  # TUNNEL_TOKEN 입력

# 백엔드 .env — 앱 설정
cp backend/.env.example backend/.env
nano backend/.env
# 필수: JWT_SECRET (랜덤 문자열), ADMIN_PASSWORD, FRONTEND_URL, CORS_ORIGINS
```

**JWT_SECRET 생성:**
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

### 3. Cloudflare Tunnel 설정

1. [Cloudflare Zero Trust](https://one.dash.cloudflare.com) → **Networks → Tunnels → Create tunnel**
2. Tunnel 이름 지정 → **Save tunnel**
3. 나오는 토큰을 `.env`의 `TUNNEL_TOKEN`에 입력
4. **Public Hostnames** 탭:
   - Subdomain: `studio` (또는 원하는 이름)
   - Domain: 보유한 도메인
   - Service: `HTTP` → URL: `frontend:80`

### 4. 실행

```bash
docker compose up -d --build
```

### 5. 초대 방법 (새 사용자 추가)

로그인 후 API로 초대 이메일 발송:
```bash
curl -X POST https://your-domain.com/api/auth/invite \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{"email":"friend@example.com"}'
```

SMTP 설정이 없으면 서버 로그에 회원가입 링크가 출력됩니다:
```bash
docker compose logs backend | grep INVITE
```

---

## 📁 Project Structure

```
lyric-video-studio/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── models/
│   │   ├── routers/
│   │   │   ├── project.py
│   │   │   └── video.py
│   │   └── services/
│   └── pyproject.toml
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── FileUpload.tsx
    │   │   ├── LyricSync.tsx
    │   │   ├── Preview.tsx
    │   │   └── Generate.tsx
    │   ├── utils/
    │   │   ├── canvasRenderer.ts   ← shared render engine (preview & video)
    │   │   ├── parseSingerTags.ts
    │   │   └── singerColors.ts
    │   └── hooks/
    │       └── useAudioPlayer.ts
    └── package.json
```

---

## 📄 License

MIT License © [insidewill](https://github.com/insidewill)

---

## 👤 Credits

Made with ❤️ by **insidewill**

Lyric videos rendered with **Lyric Video Studio** — open source, free to use.
