# 룬 미드가츠 연대기 — CLAUDE.md

라그나로크 온라인(Pre-Renewal) 기반 방치형 텍스트 RPG. 단일 HTML 파일로 구현.

**여기가 코드 실물이다** (2026-09-20부터). 문서(DEVREF-A~H·개발일지·개요·데이터베이스)는
`D:\Vault_JROC\02_Dev\App\Text_Rag\`에 그대로 있다 — Obsidian Sync가 담당. 이 폴더(코드)는
git + GitHub 원격으로 머신간 동기화한다. **이유**: 룬미드가츠_v9.16.html(~2MB) + versions/
스냅샷(2MB×12개)이 Obsidian Sync 용량 한계를 넘고, `.git` 내부(수백~수천 개 자잘한 오브젝트
파일)를 클라우드 동기화 폴더 안에 두면 조용히 깨지는 사고가 실제로 났다(2026-09-20, 이 프로젝트
자체에서 9/12~13 커밋 이력 전량 소실 — 상세: vault `룬미드가츠_개발일지.md` 2026-09-20 절).

**작업 시작 전**: vault `D:\Vault_JROC\02_Dev\App\Text_Rag\DEVREF-INDEX.md`를 먼저 읽는다 — devref
파일 인덱스(A~H)와 로드 조합이 여기서 갈라진다. 이 코드 폴더엔 DEVREF를 두지 않는다(단일 소유
원칙 — vault가 유일한 문서 정본).

**현재 파일**: `룬미드가츠_v9.16.html` (빌드 산출물, 직접 편집 금지) ← `source/template.html` +
`source/data/*.json` + `python build.py`

**모바일 플레이**: https://j-roc-h.github.io/text-rag/ (GitHub Pages, 공개 저장소, 2026-09-20 개설).
아이폰 "파일 앱"으로 html을 직접 열면 QuickLook 제한으로 JS가 안 돈다(DEVREF-E 보류-01) — 이 URL은
진짜 브라우저 탭이라 정상 동작. `build.py`가 `index.html`도 같이 굽는다(루트 URL 고정, 버전 올라가도
안 바뀜) — **버전 올릴 때 `INDEX_PATH` 갱신 빠뜨리지 말 것**, push하면 몇 분 내로 Pages 반영.
저장소가 공개라 코드가 그대로 노출된다(RO 팬게임이라 설정·이름도 원작 그대로) — 감수하기로 확정.

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
2. `DEVREF-INDEX.md` 읽기 (관련 DEVREF-A~H 이어서) — 경로는 아래 「세션 종류별 문서 경로」
3. 관련 시스템 블록 확인 (`DEVREF-A`「HTML 내부 블록 순서」)
4. 이해 안 되는 부분은 **작업 전에** 질문

## 작업 종료 후 필수 순서

1. `python build.py`로 재빌드 확인
2. `git add -A && git commit` — 이 폴더(코드)만 커밋 대상. 문서는 여기 없음
3. `git push`
4. vault `룬미드가츠_개발일지.md` 업데이트 — 날짜 + 작업 내용 요약 (vault 쪽에서 별도 편집)
5. vault `DEVREF-INDEX.md` 및 관련 DEVREF 파일 업데이트 — 변경된 스키마/함수/버그패턴 반영

## 다른 머신에서 처음 받을 때

`git clone <repo-url>` 만 하면 됨. vault는 Obsidian Sync로 별도 동기화되므로 문서는 자동으로 따라옴.
**절대 vault 폴더 안에 이 코드를 다시 넣지 말 것** — 오늘 분리한 이유가 무효화된다.

---

## 버전 업데이트 워크플로우 (2026-07-10 도입, 2026-09-20 git 반영)

**트리거**: 사용자가 명시적으로 요청할 때만 실행 ("오늘 작업 끝, 버전 올려줘" 등). 세션 종료마다 자동 실행 아님.

**버전 규칙**: 소버전 +0.01 (예: v9.15 → v9.16). 하루 작업 = 버전 1개.

**절차**:
1. 현재 html 파일명에서 버전 추출 → 새 버전 계산
2. `cp 룬미드가츠_vX.XX.html 룬미드가츠_vX.XX+0.01.html`, 기존 파일은 `versions/`로 이동
3. **커밋이 유일한 롤백점이다** — git 도입 전(2026-09-20 이전)엔 `versions/` 스냅샷이 유일한
   안전망이었으나, 이제 `git log`로 임의 시점 복원 가능. `versions/` 스냅샷은 관성적으로 계속
   쌓고 있지만 중복 백업 성격이 강해짐 — 용량 부담되면 스냅샷 주기를 늘리는 것도 고려 가능
4. vault `룬미드가츠_개발일지.md`에 새 버전 섹션 추가
5. vault `DEVREF-INDEX.md` 및 관련 DEVREF 파일 업데이트
6. 이 `CLAUDE.md` 상단 "현재 파일" 필드 갱신
7. `git add -A && git commit && git push`

---

## 코드 작업 원칙

- **요청된 블록/함수만 수정. 다른 코드 절대 건드리지 않음.**
- 타겟 패치 방식 선호 — 대규모 재작성 금지
- 원작 라그나로크 온라인 설정 최우선. 수치·로직 불확실하면 먼저 확인 요청 — 추측 교정 금지
- 완전히 이해할 때까지 질문 후 작업 시작
- **JS 문법 검증**: `<script>` 블록별로 추출해 `node --check` — 전체 HTML은 node가 직접 못 읽음
- **`build.py` 재실행 후 diff로 의도한 수정분과 일치하는지 확인** 후 커밋
