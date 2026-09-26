# rAthena Pre-Renewal reference snapshot

P2-A(콤보 정본 데이터 감사)를 위한 원본 소스 스냅샷. `canonicalize_combos.py`가 이
디렉토리만 읽는다 — TextRAG 빌드/런타임은 이번 단계에서 전혀 참조하지 않는다.

## Provenance

- **source repo**: https://github.com/rathena/rathena
- **commit**: `e985006171d2eb320ee512a653f4c83aea3d81b6`
- **path**: `db/pre-re/item_combos.yml`
- **blob SHA**: `f720ec0de4a0cacaf0131c9fad3938aff7ba280a`
- **retrieved**: 2026-09-26 (UTC, `curl` 응답 `Date` 헤더 기준)
- **mode**: `pre-re` (Pre-Renewal)

## 파일

| 파일 | 원본 경로 | 크기 | 내용 |
|---|---|---|---|
| `item_combos.yml` | `db/pre-re/item_combos.yml` | 28,860 bytes | 원본 그대로(주석 포함) 전문 보존 |
| `item_db_aegis_lookup.json` | `db/pre-re/item_db_equip.yml` + `item_db_etc.yml` + `item_db_usable.yml`에서 추출 | 29,125 bytes | `item_combos.yml`이 실제로 참조하는 278개 AegisName 전체에 대해서만 `{Id, Name, Type, srcFile}` 추출(제작 재료/스탯 등 나머지 필드는 버림) |

## commit SHA 확정 경위

최초 저장 시점(2026-09-26)에는 이 세션의 네트워크 정책이 `raw.githubusercontent.com`
(공개 CDN)만 허용하고 `api.github.com`/`github.com` 자체는 차단해서(`add_repo`로
명시적으로 붙인 저장소가 아니면 GitHub API 접근이 막혀 있음, 이 프로젝트는
`rathena/rathena`를 붙이지 않았다) `git log`/`commits API`로 정확한 commit SHA를
조회할 수 없었다. 대신 파일 크기(28,860 bytes)와 응답 `ETag`
(`d9b79d105285ce2ba858b4ab399d445d3d9f0d97740b924ed6d852799871a137`)를 콘텐츠
지문으로 남겨뒀다.

이후 commit `e985006171d2eb320ee512a653f4c83aea3d81b6`을 pin 가능한 SHA로 확정하고
다음 두 가지로 독립 검증했다:

1. `git hash-object source/reference/rathena-pre-re/item_combos.yml` →
   `f720ec0de4a0cacaf0131c9fad3938aff7ba280a` — 저장된 스냅샷의 git blob SHA.
2. `https://raw.githubusercontent.com/rathena/rathena/e985006171d2eb320ee512a653f4c83aea3d81b6/db/pre-re/item_combos.yml`
   (해당 commit SHA를 경로에 직접 지정해 재조회) → 28,860 bytes, blob SHA
   동일(`f720ec0d...`), `diff` 바이트 단위 완전 일치.

즉 저장된 파일은 이 commit의 `db/pre-re/item_combos.yml`과 바이트 단위로 동일함이
확인됐다 — ETag 지문보다 강한, git 자체의 콘텐츠 주소(blob SHA) 기준 재현성 보장이다.

## `item_db_aegis_lookup.json` 축소 근거

원본 `db/pre-re/item_db_equip.yml`(808KB)+`item_db_etc.yml`(410KB)+`item_db_usable.yml`
(449KB) = 약 1.67MB를 통째로 복제하는 것은 "불필요한 대용량 복제"에 해당한다고 판단했다
(과제 §3). 이번 단계가 실제로 필요한 것은 `item_combos.yml`이 참조하는 AegisName들의
**rAthena 공식 숫자 ID**뿐이므로(§35 provenance 용도, TextRAG 자체 매칭은 `_aegis` 필드
exact-match로 별도 수행 — 숫자 ID에 의존하지 않는다, `ITEM_COMBO_CANON_PATCH_NOTES.md`
§4 참조), 278개 AegisName 전부(빠짐없이 전수 확인, 누락 0건)에 대해서만 `{Id, Name,
Type, srcFile}` 4개 필드만 추출해 29KB로 축소했다.
