# 프리 리뉴얼 서식지 대조 기록 (2026-09-24)

기준: rAthena `npc/pre-re/mobs/dungeons/`의 [revision e985006](https://github.com/rathena/rathena/tree/e985006171d2eb320ee512a653f4c83aea3d81b6/npc/pre-re/mobs/dungeons). rAthena는 원작 서버의 공식 데이터 덤프가 아닌 에뮬레이터 자료다. 스크립트에 표시된 출현 위치를 이 게임의 합쳐진 지역 맵에 대응시켰다. 해당 맵의 모든 에피소드·시점에 대한 공식 출현 기록이라는 뜻은 아니다.

| 게임 맵 | 기존 오류 | 패치 내용 | 대조 파일 |
| --- | --- | --- | --- |
| 프론테라 지하수로 1~4층 | 2층에 4층 몬스터와 황금도둑벌레 배정 | 1·2층 출현종 정리, 3·4층 추가, 황금도둑벌레(399)는 4층으로 이동 | [prt_sew.txt](https://github.com/rathena/rathena/blob/e985006171d2eb320ee512a653f4c83aea3d81b6/npc/pre-re/mobs/dungeons/prt_sew.txt) |
| 개미 지옥 1·2층 | 1층에 마야(197) 배정 | 2층 추가, 마야 이동 | [anthell.txt](https://github.com/rathena/rathena/blob/e985006171d2eb320ee512a653f4c83aea3d81b6/npc/pre-re/mobs/dungeons/anthell.txt) |
| 모로크 피라미드 1·4·6층 | 1층에 오시리스(138) 배정 | 4·6층 추가, 오시리스는 4층, 아몬 라(194)는 6층 | [moc_pryd.txt](https://github.com/rathena/rathena/blob/e985006171d2eb320ee512a653f4c83aea3d81b6/npc/pre-re/mobs/dungeons/moc_pryd.txt) |
| 어비스 호수 심층 | 엘리옷(219) 등 생체연구소 몬스터 배정 | 원작 `abyss_03`에 있는 어시더스·페러스·미믹·하이드롤랜서로 교체, 디타르테우르스(249) 배정 | [abyss.txt](https://github.com/rathena/rathena/blob/e985006171d2eb320ee512a653f4c83aea3d81b6/npc/pre-re/mobs/dungeons/abyss.txt) |
| 용지성 | 타나토스의 고뇌(320) 등 타 지역 몬스터 배정 | 원작 `lou_dun03`에 있는 혜군·주포룡·묘괴·청이, 백소진(256) 배정 | [lou_dun.txt](https://github.com/rathena/rathena/blob/e985006171d2eb320ee512a653f4c83aea3d81b6/npc/pre-re/mobs/dungeons/lou_dun.txt) |
| 아마쯔 | RSX-0806(307)과 공장·어비스 몬스터 배정 | `ama_dun01~03` 출현종 중 게임 DB에 있는 것만 남기고 원령무사(186) 배정 | [ama_dun.txt](https://github.com/rathena/rathena/blob/e985006171d2eb320ee512a653f4c83aea3d81b6/npc/pre-re/mobs/dungeons/ama_dun.txt) |
| 오딘 신전 | 소드 가디언(273)을 MVP로 배정 | 발키리 란드그리스(295)로 변경 | [odin.txt](https://github.com/rathena/rathena/blob/e985006171d2eb320ee512a653f4c83aea3d81b6/npc/pre-re/mobs/dungeons/odin.txt) |
| 아루나펠츠 신전 성역 | 화이트스미스 하워드(241)를 MVP로 배정 | 글룸 언더 나이트(270)로 변경 | [ra_san.txt](https://github.com/rathena/rathena/blob/e985006171d2eb320ee512a653f4c83aea3d81b6/npc/pre-re/mobs/dungeons/ra_san.txt) |
| 이름없는 섬 | 타오 군카(257)를 MVP로 배정 | 수도원 3층 베르제브브(283)로 변경. 현 게임 맵은 수도원 각 층을 하나로 합쳤다. 2층의 타락한 대신관 히밤(282)을 동시에 표현할 수 없어 단일 `hasMvp`에는 추가하지 않음 | [abbey.txt](https://github.com/rathena/rathena/blob/e985006171d2eb320ee512a653f4c83aea3d81b6/npc/pre-re/mobs/dungeons/abbey.txt) |
| 포트말라야·말랑도 심해·엘 디카스테스 | 각각 메두사(359)·코볼트 아처(383)·몹스터(376)를 MVP로 배정 | 허위 `hasMvp`만 제거. 원작 프리 리뉴얼에서 해당 콘텐츠의 대체 보스를 확정하지 못해 임의 배정하지 않음 | 게임 `db-monsters.json`의 세 ID 및 DEVREF-E P0-03 |

게임 DB에 없는 도둑벌레 알·개미 알·용의 알·종이·화승총병 등은 새 몬스터를 만들어 넣지 않았다. 새로 만든 맵의 권장 레벨 범위는 해당 맵의 **일반 몬스터** 레벨을 참고한 간략 표기이며 MVP는 예외다. 피라미드 2·3·5층은 게임에 없으므로 이동선은 1→4→6층으로 줄여 연결했다.

프론테라 세계 경험 파일럿(브랜치 `claude/textrag-log-reading-ux`, 커밋 `946bdbb`)을 바탕으로 패치했다. 이 파일럿의 “2층 황금도둑벌레” 서술은 4층으로 옮기고 2층 진입 묘사는 교체했다. 파일럿 설계 원문 §11·§12·§21·§26의 2층 서술도 데스크탑 정본 승격 시 함께 갱신해야 한다. DEVREF-E P0-03의 아마쯔 RSX-0806 “교정 완료” 항목 역시 `ama_dun03` 출현 기록과 충돌한다.

이 작업은 전체 95개 맵의 출현 몬스터 전수 대조가 아니다. 이전에 만든 71개 맵 일괄 변경 패치는 근거가 부족하고 이 파일럿과 충돌하므로 대체한다. 그 외 지역, 예컨대 생체연구소 4층의 프리 리뉴얼 존재 여부나 신전 외 별도 보스는 이번에 확정하지 않았다.
