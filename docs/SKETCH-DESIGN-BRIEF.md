# the rest — 스케치(Sketch) 모듈 디자인 브리프

> 이 문서 하나로 디자인 작업이 가능하도록: ① 제품 컨텍스트 ② 스케치 기능 명세(현재 구현 그대로) ③ 오디오 엔진 제약 ④ 로드맵 ⑤ 디자인 요청사항 ⑥ Apple Design 가이드 전문 순서로 정리했습니다.

---

## 1. 제품 컨텍스트

**the rest** — 언더그라운드 아티스트를 위한 로컬 퍼스트 데스크톱 툴킷.
태그라인: **"음악 만들기나 해. 나머지는 내가 해줄게."** (Just make music. I'll do the rest.)

- 스택: Tauri 2 (macOS/Windows 네이티브 창) + React 19 + Tailwind v4 + Framer Motion 12
- 모듈 4개: **홈 / 비트 다운로더 / 스케치 / 리릭 비디오 스튜디오** — 좌측 58px 아이콘 레일로 전환
- 창: 기본 1280×840 · 최소 1080×720 · **자유 리사이즈** · **문서 스크롤 금지**(윈도우는 고정 셸, 스크롤은 패널 내부에서만) · 브라우저 줌/핀치 차단
- 유저: 홈레코딩 래퍼·싱어송라이터. DAW는 무겁고, 아이디어는 지금 떠올랐고, 완성보다 "잡아두기"가 급한 사람들
- 수익 모델: 코어 무료 + Pro 일회성 라이선스 + AI 기능은 포인트 차감(구독 없음)

### 현재 비주얼 시스템 (기존 화면들과 일관성 유지 필요)
- **다크 온리**: 바탕 `#0a0a0a`, 텍스트 `#fff / #a3a3a3(secondary) / #525252(muted)`
- **재질**: `.glass`(blur 20 + white 4.5% + top-highlight inset), `.glass-strong`(blur 40 + 깊은 그림자) — 카드/패널은 반투명 재질
- **폰트**: Pretendard 단일(디스플레이/본문/모노 전부), 큰 제목 tracking -0.021em
- **어센트**: 흰색이 기본 어센트(컬러 어센트 최소). CTA = 흰 배경 + 검정 글자 + 부드러운 흰 글로우
- **아이콘**: 이모지 금지. 자체 SVG 스트로크(1.7px, currentColor) 세트
- **모션**: critically-damped 스프링 기본(`bounce:0, duration:0.4`), 모멘텀 있는 상호작용만 `bounce:0.26`
- **모서리**: 카드 rounded-2xl(16px), 버튼 rounded-xl, 칩/필 rounded-full
- **i18n**: KR 기본 + EN 토글 — 모든 카피는 두 언어로 나옴을 전제
- **톤**: apple-design 기반 + 살짝 게임화(기존 싱크 화면에 콤보 카운터·히트 파티클 전통이 있음)

---

## 2. 스케치란 무엇인가 (제품 정의)

**DAW 없이 비트 위에 punch-in 녹음하는 부스.**

- 다운로더에서 받은 비트(키·BPM 자동 태깅됨)나 아무 오디오 파일을 골라 → **REC 한 번으로 비트가 흐르며 바로 녹음** → 테이크가 쌓임
- 목소리에는 **필수 보컬 체인**(EQ→컴프→리버브)이 자동 적용 — 전문 지식 없이 프리셋(Bright/Balanced/Dark)과 페이더 3개(VOX/BEAT/SPACE)만 만짐
- 핵심 정서: **부담 제로.** 멈블이든 프리스타일이든 "일단 뱉어두는" 곳. 완성은 나중에
- 핵심 시너지: 비트의 **키·BPM이 세션에 상속**됨 → (Phase 2) 오토튠이 그 키로 자동 스냅 — 타 앱이 못 하는 연결

---

## 3. 정보 구조 & 플로우

```
레일 🎙 스케치
 └─ ① 리스트 뷰
     ├─ 새 스케치: 보관함 비트 목록(제목·업로더·bpm/key 칩) + "파일에서 고르기"
     └─ 내 스케치: 세션 카드(비트 제목, 테이크 수, bpm/key, hover 삭제)
 └─ ② 부스 뷰 (세션 열림)
     ├─ 헤더: ← 뒤로 · 비트 제목 · bpm/key 칩 · 단축키 힌트
     ├─ 트랜스포트 카드: ▶/⏸ · ● REC(히어로) · 경과시간 · 타임라인(테이크 구간 오버레이)
     ├─ 테이크 리스트: 행 클릭=활성 토글 · @시작점·길이 · hover 삭제
     └─ 톤 패널: Bright/Balanced/Dark 필 + VOX/BEAT/SPACE 수직 페이더
```

**상태 목록** (전부 디자인 필요):
- 보관함 빈 상태 (다운로더 유도 or 파일로 시작)
- 세션 없음 빈 상태 (첫 행동 초대)
- 테이크 없음 빈 상태 ("REC!")
- 마이크 권한 거부 에러 (시스템 설정 안내)
- 비트 로딩 중 (디코딩 수 초)
- 녹음 중 (REC 빨강 + 펄스 링 + 타임라인 빨강 진행)

---

## 4. 부스 뷰 상세 명세 (현재 구현 기준)

### 트랜스포트
- 재생/일시정지: 48px 원형, `rgba(255,255,255,0.1)` 배경
- **REC 히어로 버튼**: 80px 원형. 대기 = 흰 배경 + 빨간 ● 아이콘 + 흰 글로우 / 녹음 중 = 빨강 배경 + ■ 정지 + **펄스 링 애니메이션**(1.1s 반복 확산)
- 경과시간: mono tabular, 녹음 중 빨강

### 타임라인
- 얇은 트랙(6px) 위에:
  - **테이크 구간 오버레이**: 각 테이크의 (시작점, 길이)가 반투명 바로 표시 — 활성 35% 흰색, 비활성 12%
  - 진행 바: 흰색(녹음 중 빨강)
  - 호버 시 노브 표시, 드래그로 시크
- 좌우 현재시간/총길이, 중앙에 상태 힌트("REC를 누르면 비트가 흐르면서 바로 녹음돼요" / "녹음 중")

### 테이크 리스트
- 행: 체크 원(활성=흰 배경 검정 체크 / 비활성=마이크 아이콘 45% 투명) + "테이크 N" + `@1:04 · 0:22` + hover 삭제
- 행 클릭 = 활성 토글(활성 테이크만 재생에 섞임). 여러 테이크 동시 활성 가능(레이어링)

### 톤 패널
- 프리셋 필 3개: bright / balanced / dark (선택 = 흰 배경 검정 글자)
- **수직 페이더 3개** (게임화 핵심):
  - 트랙 36×144px, 아래서 차오르는 컬러 필, 흰 알약 썸(44×24)
  - 드래그 중: 썸 1.18배 확대 + 어센트 글로우, 값 숫자 어센트 컬러로
  - 릴리즈: 스프링(bounce 0.26)으로 정착
  - **더블클릭 = 기본값 리셋**
  - 어센트: VOX `#ffd166`(앰버) · BEAT `#7dd3fc`(스카이) · SPACE `#c4b5fd`(퍼플) — 앱에서 유일하게 컬러 어센트가 허용된 곳
- 페이더 값은 세션에 저장(디바운스 0.5s)

### 단축키
`Space` 재생/정지 · `R` 녹음 토글 (입력 필드 포커스 시 무시)

---

## 5. 오디오 엔진 제약 (디자인이 존중해야 할 사실들)

1. **녹음은 RAW 저장, 체인은 재생 시 적용(비파괴)** → "톤은 언제든 다시 바꿔도 됨"이 사실 — 카피/UX에 활용 가능
2. **REC = 비트 자동 재생 + 즉시 캡처.** 카운트인 없음(백로그). 0.3초 미만 테이크는 실수로 간주하고 자동 폐기
3. **정지 시**: 재생 멈춤 + 방금 테이크 시작 0.5초 전으로 자동 시크 → "바로 들어볼 준비" 상태
4. **셀프 모니터링 없음**: 자기 목소리가 이어폰으로 돌아오지 않음(피드백/레이턴시 방지 설계) → "이어폰 끼고 녹음하세요" 힌트가 UX적으로 필요할 수 있음
5. 테이크는 출력 레이턴시 보정으로 자동 정렬되지만 기기에 따라 수십 ms 밀릴 수 있음 → (Phase 2) 테이크별 미세조정(nudge) UI 자리 필요
6. 체인 구조: HPF → EQ(peaking) → EQ(shelf) → 컴프레서 → 리버브 센드. 프리셋이 EQ/컴프 값을 결정, 페이더는 게인(VOX/BEAT)과 리버브 양(SPACE)만
7. 마이크 권한은 첫 REC 때 OS 팝업 — 거부 시 시스템 설정 경로 안내 필요 (macOS 12+ 전용)

---

## 6. 데이터 모델

```jsonc
// $APPLOCALDATA/sketches/sketches.json
{
  "id": "sk-1784091234567",
  "beat_title": "[FREE] New Jazz Type Beat | Side By Side",
  "beat_file": "sketches/sk-…/beat.wav",   // 세션 폴더로 복사됨(자가완결)
  "key": "G#",            // 다운로더에서 상속, 없을 수 있음
  "bpm": 115,             // 〃
  "takes": [
    { "id": "take-…", "file": "sketches/sk-…/take-….wav",
      "offset_sec": 96.4, "enabled": true, "created_at": "…" }
  ],
  "chain": { "preset": "balanced", "vox": 1.0, "beat": 0.9, "space": 0.25 },
  "created_at": "…", "updated_at": "…"
}
```

---

## 7. 로드맵 (디자인이 미리 자리 잡아둘 것)

- **Phase 2 — TUNE 페이더(오토튠)**: 4번째 페이더. 세션에 키가 있으면 그 키로 자동 스냅(키 칩과 시각적으로 연결되면 좋음), 키가 없으면 비활성 + "키를 모르는 비트예요" 상태. 처리형(녹음 후 수 초)이라 진행 인디케이터 필요
- **Phase 2 — 바운스 내보내기**: 비트+활성 테이크 믹스다운 → WAV/MP3 저장. 부스 우상단 or 하단 CTA 자리
- **Phase 3 — "가사 받기" (프리미엄·포인트제)**: 테이크의 플로우(음절 수·라임 위치)를 분석 → 주제/참고 입력 → AI가 톱라인에 맞는 가사 생성. `다다닥 다다다~ → "어쩌면 우린 다~"` 느낌. **포인트 잔액 표시 + 부족 시 충전 유도** UI가 필요하지만 절대 시끄럽지 않게(앱 전체가 무광고·무푸시 톤)
- 백로그: 4카운트 카운트인, 메트로놈, 구간 루프 반복 녹음(같은 8마디에 테이크 여러 개), 테이크 nudge

---

## 8. 디자인 요청사항 (다시 잡고 싶은 것)

1. **부스 뷰의 레이아웃·위계 재설계** — 지금은 "트랜스포트 카드 + 리스트 + 사이드 패널"의 기능 나열. REC이 주인공이고 나머지가 보조라는 위계가 화면에서 읽히길 원함
2. **게임화의 세련화** — REC 순간의 임팩트, 테이크가 쌓일 때의 쾌감, 페이더 만지는 재미는 유지하되 장난감처럼 보이지 않게 (apple-design의 절제 안에서)
3. **리스트 뷰를 초대장처럼** — 빈 상태가 첫 행동(비트 고르기)을 자연스럽게 유도
4. **리사이즈 대응 원칙** — 창이 좁아지거나 낮아질 때 어떤 영역이 먼저 접히고/축소되는지 우선순위 정의 (문서 스크롤은 금지 유지)
5. 기존 3개 모듈(다운로더/스튜디오)과 **한 앱처럼 보이는 일관성** — 재질/타이포/모션 토큰 준수

---

## 9. Apple Design 가이드 (전문)

# Apple Design

How Apple builds interfaces that stop feeling like a computer and start feeling like an extension of you. This knowledge comes from Apple's WWDC design talks — chiefly *Designing Fluid Interfaces* (WWDC 2018) — distilled and translated into the web platform (CSS, Pointer Events, `requestAnimationFrame`, spring libraries like Motion/Framer Motion).

The through-line: **an interface feels alive when motion starts from the current on-screen value, inherits the user's velocity, projects momentum forward, and can be grabbed and reversed at any instant.** Springs are the tool that makes all of this natural, because they are inherently interruptible and velocity-aware.

## The Core Idea

> "When we align the interface to the way we think and move, something magical happens — it stops feeling like a computer and starts feeling like a seamless extension of us."

An interface is fluid when it behaves like the physical world: things respond instantly, move continuously, carry momentum, resist at boundaries, and can be redirected mid-motion. Everything below is a way to get closer to that.

Apple frames design as serving four human needs: **safety/predictability, understanding, achievement, and joy.** Every rule here serves one of them.

## 1. Response — kill latency

The moment lag appears, the feeling of directness "falls off a cliff." Response is the foundation everything else is built on.

- **Respond on pointer-down, not on release.** Highlight a button the instant it's pressed. Waiting for `click`/touch-up to show feedback feels dead.
- **Be vigilant about every latency.** Audit debounces, artificial timers, transition waits, and the ~300ms tap delay. Anything on the input path that isn't essential is a regression.
- **Feedback must be continuous *during* the interaction, not just at the end.** For a drag, slider, or drawer, update the UI 1:1 with the pointer the whole way through — never animate only when the gesture completes.

```css
/* Feedback lives on the press, and it's instant */
.button:active {
  transform: scale(0.97);
  transition: transform 100ms ease-out;
}
```

## 2. Direct manipulation — 1:1 tracking

> "Touch and content should move together."

When the user drags something, it must stay glued to the finger — and respect the offset from *where they grabbed it*. Snapping to the element's center on grab breaks the illusion immediately.

- Use Pointer Events with `setPointerCapture` so tracking continues even when the pointer leaves the element's bounds.
- Track a short **velocity/position history** (last few `pointermove` events), not just the current point — you'll need velocity at release.

```js
el.addEventListener('pointerdown', (e) => {
  el.setPointerCapture(e.pointerId);
  const grabOffset = e.clientY - el.getBoundingClientRect().top; // respect where they grabbed
  // ...track position + timestamp history for velocity
});
```

## 3. Interruptibility — the single most important principle

> "The thought and the gesture happen in parallel."

Every animation must be interruptible and redirectable at any moment. A user must be able to grab a moving element mid-flight and reverse it without waiting for the animation to finish. A closing modal the user grabs again should follow the finger — not finish closing first, then reopen.

- **Never lock out input during a transition.**
- **Always animate from the *presentation* (current) value, never the target value.** On interrupt, read the element's live on-screen transform and start the new animation from there. Starting from the logical/target value causes a visible jump.
- **Avoid CSS transitions and `@keyframes` for anything gesture-driven** — they can't be smoothly grabbed and reversed mid-flight. Springs animate from the current value by default, which is exactly what interruption needs.
- **When a gesture reverses, blend velocity — don't hard-cut it.** Replacing one animation with another at a reversal creates a velocity discontinuity, a "brick wall." Spring libraries that carry velocity through a re-target avoid it. (This is what iOS's *additive animations* do natively; on the web, choose a spring library that re-targets from the current velocity.)
- **Decompose 2D motion into independent X and Y springs.** A single spring on a 2D distance desyncs when X and Y have different velocities.

## 4. Behavior over animation — use springs

> "Think of animation as a conversation between you and the object, not something prescribed by the interface."

A pre-scripted, fixed-duration animation can't respond to new input. A spring can — new input just changes the target, and the motion stays continuous. Reach for springs for anything a user can touch.

Apple deliberately replaced the physics triplet (mass/stiffness/damping) with two designer-friendly parameters. Think in these:

- **Damping ratio** — controls overshoot. `1.0` = critically damped, no bounce, smooth settle. `< 1.0` = overshoots and oscillates. Lower = bouncier.
- **Response** — how quickly the value reaches the target, in seconds. Lower = snappier. **This is not "duration"** — a spring has no fixed duration; its settle time emerges from the parameters.

**Defaults:**
- Start most UI at **damping `1.0`** (critically damped) — graceful and non-distracting.
- Add bounce (**damping ~`0.8`**) **only when the gesture itself carried momentum** (a flick, a throw, a drag release). Overshoot on a menu that just faded in feels wrong; overshoot on a card you flicked feels right.

**Concrete values Apple ships:**

| Interaction | Damping | Response |
| --- | --- | --- |
| Move / reposition (e.g. PiP) | `1.0` | `0.4` |
| Rotation | `0.8` | `0.4` |
| Drawer / sheet | `0.8` | `0.3` |

**Web mapping (Motion / Framer Motion):** the `bounce` + `duration` spring API maps closely to Apple's damping + response. A safe house style is `damping: 1.0` springs everywhere by default; reserve bounce for momentum-driven, physical interactions.

```js
import { animate } from 'motion';

// Critically damped default (no overshoot)
animate(el, { y: 0 }, { type: 'spring', bounce: 0, duration: 0.4 });

// Momentum interaction — a little bounce, only because a flick preceded it
animate(el, { y: target }, { type: 'spring', bounce: 0.2, duration: 0.4 });
```

## 5. Velocity handoff — the seam between drag and animation

When a gesture ends, the animation must **continue at the finger's exact velocity**, so there's no visible seam between dragging and animating. This is the detail that most separates "fluid" from "fine."

Pass the pointer's release velocity as the spring's initial velocity. Some spring APIs want **relative** velocity — normalize it by the remaining distance to the target:

```
relativeVelocity = gestureVelocity / (targetValue − currentValue)
```

Example: element at `y=50`, target `y=150` (100px to go), finger moving 50px/s → initial spring velocity = `50 / 100 = 0.5`. Framer Motion / Motion take absolute px/s velocity directly (`velocity` option), so you usually hand it the raw value.

## 6. Momentum projection — animate to where the gesture is *going*

> "Take a small input and make a big output."

Don't snap to the nearest boundary from the *release point*. Use velocity to **project the resting position** — exactly like scroll deceleration — then snap to the target nearest that projected point. This is what makes a flick feel like it throws the element.

Apple's exact projection function (from the *Designing Fluid Interfaces* sample code):

```js
// decelerationRate ≈ 0.998 for normal scroll feel; 0.99 for snappier
function project(initialVelocity /* px/s */, decelerationRate = 0.998) {
  return (initialVelocity / 1000) * decelerationRate / (1 - decelerationRate);
}

const projectedEndpoint = currentPosition + project(releaseVelocity);
const target = nearestSnapPoint(projectedEndpoint);   // choose target from the projection
animateSpringTo(target, { velocity: releaseVelocity }); // then hand off velocity (§5)
```

Note: the physics-textbook `v²/(2·decel)` is *not* what Apple ships — use the exponential-decay form above. This is the standard behavior in good bottom-sheets and carousels (Vaul, Embla).

## 7. Spatial consistency — symmetric paths, anchored origins

> "If something disappears one way, we expect it to emerge from where it came."

- **Enter and exit along the same path.** A panel that slides in from the right must dismiss to the right. In-from-right / out-the-bottom feels disconnected and confusing.
- **Anchor interactions to their source.** A menu, popover, or sheet should originate from the element that triggered it — set `transform-origin` to the trigger, so the spatial relationship between button and content is obvious. (This is the same origin-awareness point as popovers scaling from their trigger, not their center.)
- **Mirror the easing on reversible transitions** so the outbound path matches the return path (use inverse cubic-bézier control points for the two directions).

## 8. Hint in the direction of the gesture

Humans predict a final state from a trajectory. Intermediate motion should telegraph where things are going — Control Center modules "grow up and out toward your finger." Make the in-between frames point at the outcome, not just interpolate blindly to it.

## 9. Rubber-banding — soft boundaries

At an edge, resist progressively instead of stopping hard. A hard stop reads as "frozen"; continuous resistance reads as "responsive, but there's nothing more here." Apply damping that increases the further past the boundary the user drags.

```js
// The further past the bound, the less the element follows — real things slow before they stop
function rubberband(overshoot, dimension, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}
```

## 10. Gesture design details (the "feel" checklist)

- **Tap:** highlight on touch-*down* (instant), commit on touch-*up*. Add ~10px of hysteresis/hit padding around the target, and allow cancel-by-dragging-away and back.
- **Drag/swipe:** require a small movement threshold (hysteresis, ~10px) before committing to a direction, then track 1:1.
- **Detect all plausible gestures in parallel from the first move**, then confidently cancel the losers once intent is clear. Avoid recognizers that only report a *final* state (`swipeleft`-type events) — they throw away the continuous tracking you need for feedback.
- **Minimize disambiguation delays.** Double-tap detection unavoidably delays single taps; only pay that cost where double-tap truly exists.

## 11. Frame-level smoothness

Smoothness is about *what's in the frames*, not just the frame rate.

- Keep the per-frame positional change below the perception threshold to avoid strobing.
- For very fast motion, a subtle **motion blur / stretch** encodes speed and reads better than a hard sharp streak.
- `requestAnimationFrame` is the web's display-synced clock (Apple uses `CADisplayLink`). Animate only compositor-friendly properties — `transform` and `opacity` — and hint with `will-change` where motion is imminent.

## 12. Materials & depth — translucency conveys hierarchy

Apple uses translucent materials as a floating functional layer that brings structure without stealing focus. On the web, approximate with `backdrop-filter`.

- **Build nav/toolbars/sheets as translucent layers** (`backdrop-filter: blur()` + a semi-transparent background) with content scrolling underneath — not opaque bars that consume a fixed strip.
- **Material weight encodes hierarchy:** darker/heavier materials separate structural regions (sidebars); lighter materials draw attention to interactive elements (buttons). **Never stack a light translucent surface on another** — legibility collapses.
- **Bigger surfaces should read as thicker:** stronger blur + a deeper shadow than small chips. Consider context-aware shadow — heavier over busy/text content for separation, lighter over plain backgrounds.
- **Dim to focus, separate to keep flow.** A modal task pairs the surface with a dimming scrim and pushes the background back/down. A parallel, non-blocking panel uses translucency and offset *without* a scrim so the flow isn't broken. For stacked sheets, progressively dim and push back each parent layer.
- **Vibrancy keeps text legible over changing backgrounds.** Over blurred/translucent surfaces, don't use flat gray text — use higher-contrast, slightly heavier weight, and a small letter-spacing bump. Put color on a solid layer, not the translucent foreground.
- **Scroll edge effects, not hard dividers.** Instead of a 1px border under a sticky header, fade a small blur/gradient mask where content meets floating chrome — only where floating UI actually overlaps content.
- **Materialize, don't just fade.** For glass/blur surfaces, animate blur radius and scale together on enter/exit, so the surface reads as a real material arriving rather than a plain opacity fade.

```css
.toolbar {
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(20px) saturate(180%);
  border-top: 1px solid rgba(255, 255, 255, 0.4); /* bright top edge = light catching the material */
}
```

## 13. Multimodal feedback — motion + sound + haptics

Three rules for combining senses (from *Designing Audio-Haptic Experiences*):

1. **Causality** — it must be obvious what caused the feedback. Trigger it on the actual causal event (the toggle flipping, the item snapping home), and match its character to the action's physicality.
2. **Harmony** — the visual, the sound, and the haptic must fire on the **same frame**. Latency between them destroys the illusion. Don't let a CSS transition lag the audio/haptic (Vibration API).
3. **Utility** — add feedback only where it earns its place. Reserve haptics/sound for meaningful moments (success, error, commit, snap). Over-feedback trains users to ignore all of it.

## 14. Reduced motion & accessibility

Reduced motion doesn't mean *no* feedback — it means a gentler, non-vestibular equivalent. Respond to three independent signals and bake them into your components:

- **`prefers-reduced-motion: reduce`** — replace slides/springs/parallax with short opacity **cross-fades or static transitions**. Drop elastic/overshoot. Keep opacity/color changes that aid comprehension.
- **`prefers-reduced-transparency: reduce`** — make translucent surfaces frostier/solid: raise background opacity, drop the blur.
- **`prefers-contrast: more`** — near-solid backgrounds with a defined, contrasting border.

Also: avoid full-viewport moving backgrounds, slow looping oscillations (near 0.2 Hz / one cycle per 5s), and abrupt brightness jumps (ease dark↔light theme changes). Make large moving objects semi-transparent while they travel, and fade big surfaces out during a large reposition and back in once settled.

```css
@media (prefers-reduced-motion: reduce) {
  .sheet { transition: opacity 200ms ease; transform: none !important; }
}
@media (prefers-reduced-transparency: reduce) {
  .toolbar { background: white; backdrop-filter: none; }
}
```

## 15. Typography — optical sizing, tracking, leading

Apple designs type to change shape with size; the same discipline applies on the web. (From *The Details of UI Typography*, WWDC 2020.)

- **Tracking (letter-spacing) is size-specific — never one value for all sizes.** Large display text wants *negative* tracking (letters read too far apart as they grow); small text wants slightly *positive* tracking for legibility. A fixed `letter-spacing` is wrong somewhere. Tighten headings, leave body near `0`.
- **Leading (line-height) tracks size inversely.** Tight on large headings, looser on body copy. Increase it for scripts with tall ascenders/descenders; tighten it for dense, information-heavy UI.
- **Build hierarchy from weight + size + leading as a set,** not size alone. Emphasize with weight — it adds presence without taking more space.
- **Respect the user's text-size setting** (Dynamic Type). Scale layout *with* the text — spacing in `rem`/`em`, not fixed px — so a larger font doesn't break the layout.
- **Default to the platform's system font** before a custom face; it already ships optical sizing, tracking tables, and legibility tuning. Override only with a reason.

```css
:root { font: 100%/1.5 system-ui, sans-serif; } /* body: system font, comfortable leading */

.display {
  font-size: clamp(2rem, 5vw, 4rem);
  line-height: 1.05;        /* tight leading for large text */
  letter-spacing: -0.02em;  /* negative tracking as it grows */
  font-optical-sizing: auto;
}
```

## 16. Design foundations — the eight principles

The motion and craft above serve Apple's eight design principles (*Principles of Great Design*, WWDC 2026). Use these as the names you reason with:

1. **Purpose.** Make with intention; decide what *not* to build. Every feature asks for the user's time, attention, and trust — spend that budget only where it pays off.
2. **Agency.** Keep people in control: offer choices, don't force a single path. Back it with forgiveness — easy undo for slips, a confirmation dialog only for genuinely destructive, irreversible actions (use sparingly; overusing it trains people to click through).
3. **Responsibility.** Act in the user's interest. Privacy: ask at the right moment, only for what's needed, transparently. Safety: anticipate misuse and harm — especially with AI (an allergy-aware recipe app must not suggest a harmful ingredient). Add previews, confirmations, disclaimers; cut a feature whose risk outweighs its value.
4. **Familiarity.** Build on what people already know. Use metaphors that are neither too literal nor too abstract (a trash can means delete), and honor their physics. Be consistent: things that look the same must behave the same and live in the same place (close is always top-left on macOS) so people can predict what happens next. Only break a familiar pattern if you can prove it's better — then test it, don't assume.
5. **Flexibility.** Design for different contexts, devices, and the full range of abilities. Adapt to the platform (iPhone = quick touch; desktop = deep workflows with precise pointer control) and to the situation. Design inclusively (age, language, expertise, accessibility). When no single layout fits everyone, let people personalize — rearrange controls, hide what they don't use.
6. **Simplicity — not minimalism.** Strip the unnecessary so the core purpose shines; burying everything in one place looks minimal but isn't simple. Be concise (plain language, no jargon, fewer steps) and clear (use hierarchy — order, spacing, contrast — so the most important thing is the most obvious). Every element earns its place; sometimes *adding* context simplifies (a video scrubber that shows time remaining). Show the common path first, advanced options one level deeper.
7. **Craft.** Uncompromising attention to detail builds trust. Beautiful typography, colors that adapt to light/dark, clear iconography, and responsive animations that give immediate, natural feedback. Nothing is random — every spacing, timing, and alignment value is a deliberate choice you can defend. Jittery scroll, misaligned icons, and layouts that break on rotation read as carelessness. Craft needs iteration and longevity — keep evolving the design as features and hardware change.
8. **Delight.** The result of getting the other seven right, not confetti tacked on top. Decide the emotion you want people to feel (calm, confident, excited) and reinforce it in every decision.

Tactical rules that serve these:

- **Feedback comes in four kinds:** status, completion, warning, error. Confirm meaningful actions, expose ongoing status, warn before problems, validate inline (not on submit).
- **Wayfinding.** Every screen should answer: Where am I? Where can I go? What's there? How do I get out? Never trap the user.
- **Grouping & mapping.** Proximity implies relationship; place a control near what it affects and arrange controls to mirror what they change. If you need a label to explain a control, the mapping is weak.
- **Direct, specific labels beat safe generic ones.** Name nav items for their contents ("Progress", "Library"), not vague umbrellas ("Home"). Specificity creates predictability.

## 17. Process

- **Prototype interactively — an interactive demo is worth "a million static designs."** You discover the interface by building and playing with it; a working prototype also sets a concrete bar that prevents a mediocre final implementation.
- **Design interaction and visuals together.** "You shouldn't be able to tell where one ends and the other begins." Motion is not a layer added after the pixels.
- **Test with real people in real context**, and review motion with fresh eyes — play it in slow motion / frame-by-frame to catch what's invisible at full speed.

## Quick Reference

| Need | Technique | Concrete value |
| --- | --- | --- |
| Default UI spring | Critically damped, no overshoot | `damping 1.0`, `response 0.3–0.4` |
| Momentum / flick spring | Under-damped, slight bounce | `damping ~0.8`, `response 0.3–0.4` |
| Gesture → spring velocity | Hand off release velocity | `gestureVelocity / (target − current)` if normalized |
| Flick landing point | Project momentum | `current + (v/1000)·d/(1−d)`, `d ≈ 0.998` |
| Interrupt cleanly | Start from presentation (live) value | read the on-screen transform |
| Avoid reversal "brick wall" | Carry velocity through re-target | spring that blends velocity |
| Reversible transition | Mirror the easing curve | inverse cubic-bézier |
| Decide reverse vs. commit | Use velocity **sign**, not position | at release |
| 1:1 drag | Pointer Events + capture | respect the grab offset |
| Feedback | On pointer-down, continuous | never only at the end |
| Boundary | Rubber-band, don't hard-stop | progressive resistance |
| Translucent chrome | `backdrop-filter` layer | content scrolls under |
| Type tracking | Size-specific, never fixed | tighten large text (`-0.02em`), body near `0` |
| Reduced motion | Cross-fade, not slide/spring | `@media (prefers-reduced-motion)` |
