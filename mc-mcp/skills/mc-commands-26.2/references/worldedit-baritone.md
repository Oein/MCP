# WorldEdit / Baritone 커맨드 요약

바닐라가 아니라 **모드가 등록한 커맨드**다. 버전에 따라 다를 수 있으므로,
불확실하면 WorldEdit 은 `mc_command_syntax` (brigadier 에 등록되므로 보인다) 또는 `//help <command>`,
Baritone 은 `#help <command>` 로 확인해라.

---

# WorldEdit

이 프로젝트는 Modrinth 에서 해당 Minecraft 버전용 Fabric WorldEdit 빌드를 받아 `mods/worldedit.jar` 로 설치한다
(`scripts/setup.sh`). 실행은 `mc_worldedit` 툴을 쓰거나 채팅으로 직접 친다.

## 슬래시 두 개인 이유

WorldEdit 커맨드는 실제로는 `set`, `pos1`, `copy` 같은 **평범한 이름**으로 등록되어 있다.
바닐라 커맨드는 `/` 로 시작하므로, `set` 이라는 커맨드를 부르려면 `/set` 이라고 쳐야 한다.
그런데 WorldEdit 이 이름 충돌을 피하려고 커맨드 이름 자체를 `/set` (앞에 슬래시가 포함된 이름) 으로
등록했기 때문에, 채팅에서 부르려면 **커맨드 접두사 `/` + 커맨드 이름 `/set` = `//set`** 이 된다.

즉 `//set` 은 오타가 아니다. 반드시 슬래시 두 개로 쳐야 한다.
(`//` 없이 `/set` 을 치면 Baritone 의 `set` 등 다른 것과 충돌하거나 인식되지 않는다.)

`mc_worldedit` 툴에도 **입력한 그대로 `//set stone` 처럼 슬래시 두 개를 포함해서** 넘겨라.

## 선택 영역

```
//wand              나무 도끼 지급 (좌클릭=pos1, 우클릭=pos2)
//pos1              현재 위치를 pos1 로
//pos2              현재 위치를 pos2 로
//pos1 x,y,z        좌표 직접 지정 (콤마, 공백 없음)
//pos2 100,64,-200
//hpos1  //hpos2    바라보는 블록을 pos1/pos2 로
//sel cuboid        선택 모드 (cuboid | extend | poly | ellipsoid | sphere | cyl | convex)
//sel               선택 해제
//size              선택 영역 크기/부피 출력
//count <mask>      선택 영역 내 블록 개수 세기
//expand <n> [dir]  선택 영역 확장 (dir 생략 시 바라보는 방향)
//expand vert       Y축 전체로 확장
//contract <n> [dir]
//shift <n> [dir]   선택 영역 이동
//outset <n> / //inset <n>
//chunk             현재 청크 선택
```

> `mc_worldedit` 로 `//pos1` 을 쓰면 **플레이어의 현재 위치** 기준이다.
> 이동하기 싫으면 `//pos1 x,y,z` 좌표 폼을 써라.

## 영역 채우기 / 교체

```
//set <pattern>                    선택 영역 전체를 채움
//set stone
//set minecraft:oak_planks
//set 50%stone,50%cobblestone      확률 패턴
//set air                          비우기

//replace <from> <to>              from 블록만 to 로 교체
//replace stone diamond_block
//replace #existing air            공기가 아닌 모든 블록을 공기로

//walls <pattern>                  옆면(벽)만
//faces <pattern>                  6면 전부
//outline <pattern>                //faces 와 동일 계열
//hollow [thickness] [pattern]     내부를 비움
//overlay <pattern>                맨 위 블록 위에 덮기
//center <pattern>                 중심 블록
//line <pattern> [thickness]       (convex 선택 시) 점들을 잇는 선
//smooth [iterations]              지형 평탄화
//naturalize                       흙/자갈 → 잔디+흙+돌 층으로 자연화
```

## 도형 생성 (플레이어 위치 기준)

```
//sphere <pattern> <radius> [raised]
//sphere glass 10
//sphere stone 10,20,10          x,y,z 반경 개별 지정
//hsphere glass 10               속 빈 구

//cyl <pattern> <radius> [height]
//cyl stone 8 20
//hcyl glass 8 20                속 빈 원기둥

//pyramid <pattern> <size>
//hpyramid <pattern> <size>
```

`raised` 를 `true` 로 주면 구가 플레이어 발밑이 아니라 위로 올라간 위치에 생성된다.

## 복사 / 붙여넣기 / 스택

```
//copy               선택 영역을 클립보드로 (플레이어 위치가 기준점)
//copy -e            엔티티 포함
//cut                복사 + 원본 제거
//paste              클립보드 붙여넣기 (원래 상대 위치)
//paste -a           공기 블록 무시
//paste -o           클립보드 원점 기준으로 정확히 붙여넣기
//paste -s           붙여넣은 영역을 선택 영역으로

//rotate <y-deg> [x-deg] [z-deg]   클립보드 회전 (90 단위 권장)
//flip [dir]                        클립보드 뒤집기

//stack <count> [dir]      선택 영역을 방향으로 반복 복사 (dir 생략 시 바라보는 방향)
//stack 5 up
//stack 10 north -a        공기 무시

//move <count> [dir] [replace]   선택 영역 자체를 이동
//move 5 up
```

## 브러시

플레이어가 든 아이템에 브러시를 바인딩한다. 우클릭으로 사용.

```
//brush sphere <pattern> [radius]
//brush sphere stone 5
//brush cylinder <pattern> [radius] [height]
//brush smooth [size] [iterations]
//brush gravity [radius]
//brush clipboard              클립보드를 브러시로
//mask <mask>                  브러시가 영향 줄 블록 제한
//mask                         마스크 해제
//material <pattern>           브러시 재질 변경
//size <radius>                브러시 크기 변경
//none  (또는 //brush none)    현재 아이템의 브러시 해제
```

## 실행 취소 / 유틸

```
//undo [count]      직전 작업 취소
//redo [count]
//limit <n>         한 작업의 최대 블록 수 제한
//fast              (구버전) 빠른 모드
//drain <radius>    물/용암 제거
//fixwater <radius> / //fixlava <radius>
//removeabove [size] [height]
//removebelow [size] [height]
//removenear <block> [size]
//green [radius]    흙 → 잔디
//snow [radius]     눈 덮기
//thaw [radius]     눈/얼음 제거
/toggleeditwand     완드 아이템 토글 (슬래시 하나!)
//help              커맨드 목록
//help <command>    개별 커맨드 도움말
```

## 스키매틱

```
//schem list
//schem save <name>
//schem load <name>
//schem delete <name>
```
(구버전 별칭: `//schematic`)

## 주의

- WorldEdit 작업은 **op 권한**이 필요하다.
- 큰 영역은 시간이 걸린다. `mc_worldedit` 의 `waitMs` 를 올려라 (기본 2000).
- 작업 결과는 `mc_scan_blocks` 로 검증해라. WorldEdit 은 성공 메시지만 채팅에 뿌린다.
- `//set` 계열은 되돌릴 수 있지만(`//undo`) 세션/서버 재시작 후에는 불가능하다.
- 위 목록은 널리 쓰이는 안정적인 커맨드 위주다. **인자 순서가 헷갈리면
  `//help <command>` 또는 `mc_command_syntax` 로 확인해라.**

---

# Baritone

자동 경로탐색/채굴/건축 봇. 이 저장소는 `baritone/upstream-26.2` 와 `baritone/dysnasia-26.2` 를 포함한다.

## 채팅 접두사는 `#`

Baritone 커맨드는 바닐라 커맨드가 아니라 **채팅 메시지**로 전달된다.
기본 접두사는 `#` 이다 (`Settings.prefix` 기본값 `"#"`). 예: `#goto 100 64 200`

- `/` 로 시작하면 안 된다. `#` 로 시작해야 한다.
- 이 프로젝트에서는 `mc_baritone` 툴 또는 `mc_goto` 를 쓰는 편이 낫다. 채팅으로 직접 칠 수도 있다.
- Baritone 커맨드는 brigadier 에 등록되지 않으므로 **`mc_command_syntax` 로는 보이지 않는다.**
  `#help` 로 확인해라.

## 이동

```
#goto <x> <y> <z>       좌표로 이동
#goto <x> <z>           Y 무관하게 해당 XZ 로
#goto <y>               해당 고도로
#goto <block>           가장 가까운 해당 블록으로 (예: #goto diamond_ore)
#goal <x> <y> <z>       목표만 설정 (경로 시작 안 함)
#goal                   현재 위치를 목표로
#goal clear             목표 해제
#path                   설정된 목표로 경로탐색 시작
#come                   카메라(관전자) 위치로 오기
#thisway <distance>     (별칭 #forward) 바라보는 방향으로 n 블록
#axis                   (별칭 #highway) 가장 가까운 축/대각선으로
#surface                (별칭 #top) 지상으로 나가기
#explore [x z]          미탐험 청크 탐색
#elytra [x y z]         엘리트라 비행 (지원 빌드에서만)
```

## 채굴 / 수집

```
#mine <block> [...]         해당 블록 채굴 (여러 개 나열 가능)
#mine diamond_ore
#mine iron_ore coal_ore
#mine 64 diamond_ore        개수 지정 (앞에 수량)
#follow player <name>       플레이어 따라가기
#follow entity <type>
#follow entities
#follow players
#farm [range] [x y z]       농사
#pickup <item>              아이템 줍기
#tunnel [height width depth] 터널 파기
```

## 선택 영역 (`#sel`) — Baritone 자체 셀렉션

WorldEdit 과 별개의 시스템이다. 별칭: `#selection`, `#s`

```
#sel pos1            (별칭 p1, 1)
#sel pos2            (별칭 p2, 2)
#sel clear           (c)
#sel undo            (u)
#sel set <block> [replace]     (별칭 fill, s, f) 선택 영역 채우기
#sel walls <block>   (w)
#sel shell <block>   (shl)
#sel sphere <block>  (sph)
#sel hsphere <block> (hsph)
#sel cylinder <block>  (cyl)
#sel hcylinder <block> (hcyl)
#sel cleararea       (ca)
#sel replace <from...> <to>    (r)
#sel expand <dir> <n>   (ex)
#sel contract <dir> <n> (ct)
#sel shift <dir> <n>    (sh)
#sel copy [x y z]    (cp)
#sel paste [x y z]   (p)
```

> WorldEdit 과 달리 `#sel set` 은 **봇이 실제로 블록을 놓고 부수며** 수행한다.
> 인벤토리에 블록이 있어야 하고 시간이 오래 걸린다. 즉시 결과가 필요하면 WorldEdit `//set` 을 써라.

## 건축 (스키매틱)

```
#build <name>             schematics 폴더의 스키매틱 건축
#build <name> <x> <y> <z> 지정 좌표에 건축
#schematica               Schematica 모드의 열린 스키매틱 건축
#litematica [index]       Litematica 모드의 스키매틱 건축
```

## 실행 제어

```
#pause      (별칭 p, paws)  일시정지
#resume     (별칭 r, unpause) 재개
#paused                     일시정지 상태 조회
#cancel     (별칭 c, stop)   현재 작업 취소
#forcecancel                강제 취소 (cancel 이 안 먹을 때)
#proc                       현재 실행 중인 프로세스 확인
#eta                        예상 도착 시간
```

**`#stop` 은 `#cancel` 의 별칭이다.** 멈추고 싶으면 `#cancel` 또는 `#stop`, 그래도 안 되면 `#forcecancel`.

## 설정 (`#set`)

별칭: `#setting`, `#settings`

```
#set                          수정된 설정 목록
#set list                     전체 설정 목록
#set <setting>                현재 값 조회
#set <setting> <value>        값 변경
#set reset <setting>          기본값으로
#set reset all                전부 초기화
#set save / #set load
```

자주 쓰는 설정:
```
#set allowBreak true          블록 파괴 허용
#set allowPlace true          블록 설치 허용
#set allowSprint true
#set allowParkour true
#set allowInventory true      인벤토리 자동 사용
#set avoidance true
#set renderGoal false
#set legitMine false
```

## 웨이포인트 (Baritone 자체 — 바닐라 `/waypoint` 와 무관)

별칭: `#waypoint`, `#wp`

```
#waypoints                    목록
#waypoints save <tag> <name>  현재 위치 저장
#waypoints goto <name>        해당 웨이포인트로 이동
#waypoints delete <name>
#waypoints list <tag>
```

> 바닐라 `/waypoint` (로케이터 바) 와 **완전히 다른 기능**이다. 혼동하지 마라.

## 기타

```
#help              전체 커맨드 목록
#help <command>    개별 도움말
#version
#find <block>      캐시에서 블록 위치 찾기
#repack            (별칭 #rescan) 주변 청크 다시 캐싱
#gc                가비지 컬렉션
#invert            현재 목표를 반대로 (도망)
#blacklist         현재 목표 블랙리스트에 추가
#click             클릭한 위치로 경로탐색
#render            렌더링 다시 그리기
#reloadall / #saveall   캐시 로드/저장
#explorefilter <file> [invert]
#path
```
