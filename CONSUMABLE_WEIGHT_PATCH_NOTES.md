# 소모품 무게 정합화 패치

- 기준: rAthena pre-re item DB
- 고정 원본 SHA: `e985006171d2eb320ee512a653f4c83aea3d81b6`
- 환산: rAthena `Weight / 10 = TextRAG 무게`
- 원본 직접 검증: **87 / 90**
- 실제 변경: **69**
- 보류(원작 직접 대응 없음/변형): **3**

## 변경 항목

| TextRAG | 기존 | 수정 | Aegis | rAthena ID | 원작명 |
|---|---:|---:|---|---:|---|
| Steel Arrow | 0 | **0.2** | `Steel_Arrow` | 1753 | Steel Arrow |
| Arrow of Wind | 0 | **0.2** | `Arrow_Of_Wind` | 1755 | Arrow of Wind |
| 빨간포션 | 7 | **7** | `Red_Potion` | 501 | Red Potion |
| 주홍포션 | 7 | **10** | `Orange_Potion` | 502 | Orange Potion |
| 노란포션 | 7 | **13** | `Yellow_Potion` | 503 | Yellow Potion |
| 하얀포션 | 7 | **15** | `White_Potion` | 504 | White Potion |
| 파란포션 | 7 | **15** | `Blue_Potion` | 505 | Blue Potion |
| 초록포션 | 7 | **7** | `Green_Potion` | 506 | Green Potion |
| 파리의 날개 | 7 | **5** | `Wing_Of_Fly` | 601 | Fly Wing |
| 나비의 날개 | 7 | **5** | `Wing_Of_Butterfly` | 602 | Butterfly Wing |
| 각성의 포션 | 7 | **15** | `Awakening_Potion` | 656 | Awakening Potion |
| 화살 | 7 | **0.1** | `Arrow` | 1750 | Arrow |
| 철 화살 | 7 | **0.1** | `Iron_Arrow` | 1770 | Iron Arrow |
| 강철의 화살 | 7 | **0.2** | `Steel_Arrow` | 1753 | Steel Arrow |
| 오리데오콘 화살 | 7 | **0.3** | `Oridecon_Arrow` | 1765 | Oridecon Arrow |
| 날카로운 화살 | 7 | **0.3** | `Incisive_Arrow` | 1764 | Sharp Arrow |
| 녹슨 화살 | 7 | **0.2** | `Rusty_Arrow` | 1762 | Rusty Arrow |
| 파마의 화살 | 7 | **0.3** | `Arrow_Of_Counter_Evil` | 1766 | Arrow of Counter Evil |
| 불화살 | 7 | **0.2** | `Fire_Arrow` | 1752 | Fire Arrow |
| 수정 화살 | 7 | **0.2** | `Crystal_Arrow` | 1754 | Crystal Arrow |
| 바람의 화살 | 7 | **0.2** | `Arrow_Of_Wind` | 1755 | Arrow of Wind |
| 암석 화살 | 7 | **0.2** | `Stone_Arrow` | 1756 | Stone Arrow |
| 성스러운 화살 | 7 | **0.2** | `Holy_Arrow` | 1772 | Holy Arrow |
| 은화살 | 7 | **0.2** | `Silver_Arrow` | 1751 | Silver Arrow |
| 그림자의 화살 | 7 | **0.2** | `Arrow_Of_Shadow` | 1767 | Arrow of Shadow |
| 무형의 화살 | 7 | **0.1** | `Immatrial_Arrow` | 1757 | Immaterial Arrow |
| 독화살 | 7 | **0.3** | `Poison_Arrow` | 1763 | Poison Arrow |
| 스턴 애로우 | 7 | **0.3** | `Stun_Arrow` | 1758 | Stun Arrow |
| 슬립 애로우 | 7 | **0.3** | `Sleep_Arrow` | 1768 | Sleep Arrow |
| 프리징 애로우 | 7 | **0.3** | `Freezing_Arrow` | 1759 | Frozen Arrow |
| 플래쉬 애로우 | 7 | **0.3** | `Flash_Arrow` | 1760 | Flash Arrow |
| 사일런스 애로우 | 7 | **0.3** | `Silence_Arrow` | 1769 | Mute Arrow |
| 커스 애로우 | 7 | **0.3** | `Curse_Arrow` | 1761 | Cursed Arrow |
| 화살통 | 7 | **25** | `Arrow_Container` | 12004 | Quiver |
| 철 화살통 | 7 | **25** | `Iron_Arrow_Container` | 12005 | Iron Arrow Quiver |
| 강철의 화살통 | 7 | **25** | `Steel_Arrow_Container` | 12006 | Steel Arrow Quiver |
| 오리데오콘 화살통 | 7 | **25** | `Ori_Arrow_Container` | 12007 | Oridecon Arrow Quiver |
| 녹슨 화살통 | 7 | **25** | `Rusty_Arrow_Container` | 12015 | Rusty Arrow Quiver |
| 불화살통 | 7 | **25** | `Fire_Arrow_Container` | 12008 | Fire Arrow Quiver |
| 수정 화살통 | 7 | **25** | `Crystal_Arrow_Container` | 12012 | Crystal Arrow Quiver |
| 바람 화살통 | 7 | **25** | `Wind_Arrow_Container` | 12010 | Wind Arrow Quiver |
| 암석 화살통 | 7 | **25** | `Stone_Arrow_Container` | 12011 | Stone Arrow Quiver |
| 성스러운 화살통 | 7 | **25** | `Holy_Arrow_Quiver` | 12183 | Holy Arrow Quiver |
| 은화살통 | 7 | **25** | `Silver_Arrow_Container` | 12009 | Silver Arrow Quiver |
| 그림자화살통 | 7 | **25** | `Shadow_Arrow_Container` | 12013 | Shadow Arrow Quiver |
| 무형의 화살통 | 7 | **25** | `Imma_Arrow_Container` | 12014 | Immaterial Arrow Quiver |
| 고목나무 가지 | 7 | **5** | `Branch_Of_Dead_Tree` | 604 | Dead Branch |
| 낡은 카드첩 | 7 | **5** | `Old_Card_Album` | 616 | Old Card Album |
| 사과 | 7 | **2** | `Apple` | 512 | Apple |
| 선물상자 | 7 | **20** | `Gift_Box` | 644 | Gift Box |
| 성수 | 7 | **3** | `Holy_Water` | 523 | Holy Water |
| 오래된보라상자 | 7 | **20** | `Old_Violet_Box` | 617 | Old Purple Box |
| 오래된빨간상자 | 7 | **20** | `Red_Box` | 12186 | Old Red Box |
| 오래된파란상자 | 7 | **20** | `Old_Blue_Box` | 603 | Old Blue Box |
| 오렌지 | 7 | **2** | `Orange` | 582 | Orange |
| 웰스쿠키 | 7 | **3** | `Well_Baked_Cookie` | 538 | Well-baked Cookie |
| 조각케이크 | 7 | **10** | `Piece_Of_Cake` | 539 | Piece of Cake |
| 초록허브 | 7 | **3** | `Green_Herb` | 511 | Green Herb |
| 파란허브 | 7 | **7** | `Blue_Herb` | 510 | Blue Herb |
| 하얀허브 | 7 | **7** | `White_Herb` | 509 | White Herb |
| 고기 | 15 | **15** | `Meat` | 517 | Meat |
| 꿀 | 10 | **10** | `Honey` | 518 | Honey |
| 딸기 | 2 | **2** | `Strawberry` | 578 | Strawberry |
| 마스텔라의 열매 | 3 | **3** | `Fruit_Of_Mastela` | 522 | Mastela Fruit |
| 몬스터 사료 | 15 | **15** | `Monster's_Feed` | 528 | Monster's Feed |
| 빨간 허브 | 3 | **3** | `Red_Herb` | 507 | Red Herb |
| 사탕 | 3 | **3** | `Candy` | 529 | Candy |
| 옐로 허브 | 5 | **5** | `Yellow_Herb` | 508 | Yellow Herb |
| 캔디 스트라이퍼 | 4 | **4** | `Candy_Striper` | 530 | Candy Cane |

## 보류

- `보물상자`: 현재 무게 7, `weightSrc=type`. 원작 동일 항목으로 단정하지 않고 별도 게임 설계값 검토.
- `조합 키트`: 현재 무게 7, `weightSrc=type`. 원작 동일 항목으로 단정하지 않고 별도 게임 설계값 검토.
- `황금포션`: 현재 무게 7, `weightSrc=type`. 원작 동일 항목으로 단정하지 않고 별도 게임 설계값 검토.

## 검증 조건

- `_aegis`가 연결된 모든 소모품은 고정 rAthena 원본의 `Weight/10`과 일치해야 한다.
- 소수 무게(화살 0.1~0.3)를 반올림/절삭하지 않는다.
- `보물상자`, `조합 키트`, `황금포션`은 이번 패치에서 임의 수정하지 않는다.
