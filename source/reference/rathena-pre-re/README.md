# rAthena Pre-Renewal reference snapshot

P2-A(콤보 정본 데이터 감사)를 위한 원본 소스 스냅샷. `canonicalize_combos.py`가 이
디렉토리만 읽는다 — TextRAG 빌드/런타임은 이번 단계에서 전혀 참조하지 않는다.

## Provenance

- **source repo**: https://github.com/rathena/rathena
- **branch**: `master`
- **retrieved**: 2026-09-26 (UTC, `curl` 응답 `Date` 헤더 기준)
- **mode**: `pre-re` (Pre-Renewal)

## 파일

| 파일 | 원본 경로 | 크기 | 내용 |
|---|---|---|---|
| `item_combos.yml` | `db/pre-re/item_combos.yml` | 28,860 bytes | 원본 그대로(주석 포함) 전문 보존 |
| `item_db_aegis_lookup.json` | `db/pre-re/item_db_equip.yml` + `item_db_etc.yml` + `item_db_usable.yml`에서 추출 | 29,125 bytes | `item_combos.yml`이 실제로 참조하는 278개 AegisName 전체에 대해서만 `{Id, Name, Type, srcFile}` 추출(제작 재료/스탯 등 나머지 필드는 버림) |

## commit SHA를 남기지 못한 이유

이 세션의 네트워크 정책은 `raw.githubusercontent.com`(공개 CDN)만 허용하고
`api.github.com`/`github.com` 자체는 차단한다(`add_repo`로 명시적으로 붙인 저장소가
아니면 GitHub API 접근이 막혀 있음, 이 프로젝트는 `rathena/rathena`를 붙이지 않았다).
그래서 `git log`/`commits API`로 정확한 commit SHA를 조회할 수 없었다. 대신:

- 위 표의 정확한 파일 크기(bytes)
- `item_combos.yml` 응답의 `ETag`: `d9b79d105285ce2ba858b4ab399d445d3d9f0d97740b924ed6d852799871a137`

를 콘텐츠 지문(fingerprint)으로 남긴다 — 같은 URL을 다시 받아 바이트 단위로 동일한지
검증 가능하다. `item_combos.yml` 원문 전체를 그대로 저장했으므로(요약/재구성 아님),
사실상 commit SHA보다 더 강한 재현성 보장이다(파일 자체가 증거).

## `item_db_aegis_lookup.json` 축소 근거

원본 `db/pre-re/item_db_equip.yml`(808KB)+`item_db_etc.yml`(410KB)+`item_db_usable.yml`
(449KB) = 약 1.67MB를 통째로 복제하는 것은 "불필요한 대용량 복제"에 해당한다고 판단했다
(과제 §3). 이번 단계가 실제로 필요한 것은 `item_combos.yml`이 참조하는 AegisName들의
**rAthena 공식 숫자 ID**뿐이므로(§35 provenance 용도, TextRAG 자체 매칭은 `_aegis` 필드
exact-match로 별도 수행 — 숫자 ID에 의존하지 않는다, `ITEM_COMBO_CANON_PATCH_NOTES.md`
§4 참조), 278개 AegisName 전부(빠짐없이 전수 확인, 누락 0건)에 대해서만 `{Id, Name,
Type, srcFile}` 4개 필드만 추출해 29KB로 축소했다.
