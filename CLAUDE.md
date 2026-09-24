# 룬 미드가츠 연대기 — CLAUDE.md

라그나로크 온라인(Pre-Renewal) 기반 방치형 텍스트 RPG. 단일 HTML 파일로 구현.

**여기가 코드 실물이다** (2026-09-20부터). 문서(DEVREF-A~H·개발일지·개요·데이터베이스)는
`D:\Vault_JROC\02_Dev\App\Text_Rag\`에 있다 — 이 코드 폴더엔 DEVREF를 두지 않는다(vault가 유일한
문서 정본). 코드는 git + GitHub 원격으로 머신간 동기화한다. 분리 이유(대용량 html + `.git`을 클라우드
동기화 폴더에 두면 조용히 깨짐, 9/12~13 이력 실소실): vault `룬미드가츠_개발일지.md` 2026-09-20 절.

**현재 파일**: `룬미드가츠_v9.19.html` (빌드 산출물, 직접 편집 금지) ← `source/template.html` +
`source/data/*.json` + `python build.py`

**모바일 플레이**: https://j-roc-h.github.io/text-rag/ (GitHub Pages, 공개 저장소 — 노출 감수 확정).
`build.py`가 매 빌드마다 고정 `index.html`도 굽는다. 아이폰 파일앱 QuickLook은 JS 미실행(DEVREF-E 보류-01).

**버전 업데이트**: 코드(`source/`)가 바뀐 세션은 마무리 때 **반드시** +0.01 (하루 1개 — 같은 날 이미 올렸으면
그 버전에 커밋). 코드 변경이 없던 세션은 올리지 않는다. 절차는 vault `DEVREF-A`「버전 업데이트 워크플로우」.

---

## 세션 종류별 문서 경로 (2026-09-21)

문서 정본은 언제나 vault다. 아래는 **정본에 닿는 방법**만 갈린다.

- **데스크탑**: vault `D:\Vault_JROC\02_Dev\App\Text_Rag\` 직접 읽기. 세션 시작 시
  `powershell -File scripts\sync-docs.ps1` 로 미러를 갱신한다(첫 실행만 `-Mode Initialize`).
- **모바일/웹 세션**: vault에 닿을 수 없다 — 폰이 아니라 클라우드 컨테이너에서 돌기 때문이다.
  `J-Roc-H/text-rag-docs`(비공개 미러)를 `add_repo`로 붙여 읽는다. **미러는 읽기 전용** —
  DEVREF·개발일지를 여기서 고치지 않는다(정본 단일 소유). 남길 기록은
  `_mobile-inbox/YYYY-MM-DD.md`에 append하고 push한다.
- 데스크탑은 `_mobile-inbox/`에 들어온 초안을 `/wrapup-dev`로 정본에 병합한 뒤 그 파일을 지운다.
  **인박스에 파일이 남아 있는 동안은 그 세션 기록이 아직 정본에 없다.**

## 작업 시작 전 필수 순서

1. `git pull` — 다른 머신에서 작업했을 수 있음
2. `DEVREF-INDEX.md` 읽기 (관련 DEVREF-A~H 이어서) — 경로는 위 「세션 종류별 문서 경로」
3. 관련 시스템 블록 확인 (`DEVREF-A`「HTML 내부 블록 순서」)
4. 이해 안 되는 부분은 **작업 전에** 질문

## 작업 종료 후 필수 순서

1. `python build.py`로 재빌드 확인
2. `git add -A && git commit` → `git push` — 이 폴더(코드)만 커밋 대상
3. vault `룬미드가츠_개발일지.md` + `DEVREF-INDEX.md`·관련 DEVREF 갱신 (vault 쪽에서 별도 편집)

다른 머신에선 `git clone`만 하면 된다. **절대 vault 폴더 안에 이 코드를 다시 넣지 말 것.**

## 코드 작업 원칙

- **요청된 블록/함수만 수정. 다른 코드 절대 건드리지 않음.**
- 타겟 패치 방식 선호 — 대규모 재작성 금지
- 원작 라그나로크 온라인 설정 최우선. 수치·로직 불확실하면 먼저 확인 요청 — 추측 교정 금지
- 완전히 이해할 때까지 질문 후 작업 시작
- **JS 문법 검증**: `<script>` 블록별로 추출해 `node --check` — 전체 HTML은 node가 직접 못 읽음
- **`build.py` 재실행 후 diff로 의도한 수정분과 일치하는지 확인** 후 커밋
