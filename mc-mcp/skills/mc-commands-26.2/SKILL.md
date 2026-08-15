---
name: mc-commands-26.2
description: Minecraft Java Edition 26.2 ("Chaos Cubed") 커맨드를 작성하거나 검증할 때 읽어라. /dialog, /waypoint, /stopwatch, /swing, /unpublish 같은 26.x 신규 커맨드나, /time 세계 시계 개편 · 텍스트 컴포넌트 click_event 처럼 1.21 이하와 문법이 달라진 것을 다룰 때. 구버전(1.20/1.21) 문법으로 잘못 쓰기 쉬운 상황, 커맨드가 26.2 에 실제로 존재하는지 확인해야 할 때에도 사용.
---

# Minecraft 26.2 커맨드 레퍼런스

## 이 스킬을 읽는 AI 에이전트에게

너의 학습 데이터는 대부분 **1.20/1.21 시절**이다. 26.2 는 그보다 한참 뒤다.
기억에 의존해 커맨드를 쓰면 다음과 같이 틀린다:

- 존재하지 않는 커맨드를 쓴다 (또는 새로 생긴 커맨드를 모른다)
- `/time set day` 같은 구버전 폼을 쓴다 → 26.1 에서 세계 시계 기반으로 재구성됨
- `"clickEvent": {"action": "run_command", "value": "/foo"}` 를 쓴다 → 1.21.5 에서 `click_event` + `command` 로 바뀜
- `/team modify t color darkpurple` 을 쓴다 → 26.2 에서 `dark_purple` 만 허용

**규칙: 문법이 조금이라도 불확실하면 추측하지 말고 실행 중인 서버에 물어봐라.** 아래 "런타임 검증" 참고.

## 런타임 검증 (이 스킬의 안전망 — 먼저 읽어라)

이 프로젝트에는 실행 중인 클라이언트/서버의 **실제 brigadier 커맨드 트리**에서 usage 문자열을 그대로 읽어오는 툴이 있다.
문서도 아니고 기억도 아니고, **그 서버가 실제로 파싱하는 문법**이다. 버전 차이, 데이터팩 함수, WorldEdit, 다른 모드까지 전부 자동으로 커버된다.

전용 툴 (권장):

```
mc_command_syntax                      # 인자 없음 → 서버가 제공하는 모든 커맨드 이름 목록
mc_command_syntax  command="dialog"    # 특정 커맨드의 전체 usage 라인
```

동일한 것을 raw 로 호출하려면:

```
mc_raw  action="get_command_syntax"                          # params 없음 → 전체 목록
mc_raw  action="get_command_syntax"  params={"command":"dialog"}
mc_raw  action="get_command_syntax"  params={"command":"time","limit":800}
```

- 커맨드 트리는 **서버가 보내주는 것**이라 월드/서버에 접속한 뒤에만 동작한다. 미접속 시 에러가 난다.
- 없는 커맨드를 물으면 `didYouMean` 후보를 돌려준다.
- usage 가 많으면 `limit` (기본 400) 로 잘린다. `truncated`/`total` 필드를 확인해라.

**언제 반드시 호출해야 하나:**
1. 이 문서에 "확인 필요" 라고 표시된 항목
2. 26.x 신규 커맨드를 처음 쓸 때 (`dialog`, `waypoint`, `stopwatch`, `swing`, `rotate`, `unpublish` …)
3. 커맨드 실행이 파싱 에러로 실패했을 때 — 다시 추측하지 말고 즉시 이걸 호출
4. WorldEdit / Baritone 등 모드 커맨드 (WorldEdit 은 brigadier 에 등록되므로 여기서 보인다)

## 버전 체계 (헷갈리지 마라)

- 2026년부터 Mojang 은 `year.drop.hotfix` 체계를 쓴다. **`26.2` 는 "1.26.2" 가 아니다.** `1.` 접두사는 사라졌다.
- `26.0` 은 존재하지 않는다. 1.21.x 시리즈 다음이 곧바로 **26.1** 이다.
- 순서: `1.21.x` … → **26.1** (2026-03-24) → 26.1.1 → 26.1.2 → **26.2** (2026-06-16, 코드명 **Chaos Cubed**) → 26.3 (Q3 2026, 아직 아님)
- 26.2 는 **Java SE 25** 이상을 요구한다.
- 26.2 의 data pack / resource pack format 은 `107.1`.
- 26.3 에서 예정된 것(`/posteffect`, `/publish` 의 gamemode 인자 제거 등)은 **26.2 에 없다.** 쓰지 마라.

## 26.2 에 존재하는 커맨드 전체 목록

게임 jar 에서 추출하고, 실행 중인 26.2 서버에 조회해 교차 검증한 목록이다.

```
advancement  attribute  ban  ban-ip  banlist  bossbar  chase  clear  clone  damage
data  datapack  debug  debugconfig  debugmobspawning  debugpath  defaultgamemode
deop  dialog  difficulty  effect  enchant  execute  experience  fetchprofile  fill
fillbiome  forceload  function  gamemode  gamerule  give  help  item  jfr  kick
kill  list  locate  loot  me  msg  op  pardon  pardon-ip  particle  perf  place
playsound  publish  raid  random  recipe  reload  return  ride  rotate  save-all
save-off  save-on  say  schedule  scoreboard  seed  serverpack  setblock
setidletimeout  setworldspawn  spawn_armor_trims  spawnpoint  spectate
spreadplayers  stop  stopsound  stopwatch  summon  swing  tag  team  teammsg
teleport  tellraw  test  tick  time  title  transfer  trigger  unpublish  version
warden_spawn_tracker  waypoint  weather  whitelist  worldborder
```

**`/posteffect` 는 26.2 에 없다** (26.3 예정). 실행 중인 서버에 조회해서 확인했다.

별칭: `tp`(→teleport), `w`/`tell`(→msg), `xp`(→experience), `tm`(→teammsg).

이 목록은 26.2 클라이언트 jar 의 커맨드 클래스를 조사해 만들었고, 실행 중인 26.2 서버에
직접 조회해 교차 검증했다. 다만 **"목록에 없으니 존재하지 않는다" 는 결론은 내리지 마라.**
커맨드 클래스가 `net.minecraft.server.commands` 밖에 있는 경우가 실제로 있다 — `/test` 가
그렇다 (`net.minecraft.gametest.framework.TestCommand`). 없다고 단정하기 전에
`mc_command_syntax` 로 확인해라.

주의할 점:
- `debug`, `debugconfig`, `debugmobspawning`, `debugpath`, `chase`, `serverpack`, `spawn_armor_trims` 는 **디버그 커맨드**다. 대부분 `-DMC_DEBUG_DEV_COMMANDS` (chase 는 `-DMC_DEBUG_CHASE_COMMAND`) JVM 프로퍼티가 있어야 등록된다. 일반 서버에는 안 보인다.
- `/test` — **존재한다.** 게임테스트 프레임워크 커맨드이고 서브커맨드가 40개가 넘는다
  (`run`, `runmultiple`, `runthese`, `runclosest`, `create`, `pos` 등). 필요하면
  `mc_command_syntax command="test"` 로 확인해라.
- `/posteffect` — **26.2 에 없다.** 26.3 예정. 쓰지 마라.
- `/transfer` — 클래스는 존재하지만 **싱글플레이 통합 서버에는 등록되지 않는다** (실측).
  전용 서버에서만 쓸 수 있다고 보는 게 안전하다. 이처럼 **커맨드 존재 여부는 서버마다
  다르므로**, 최종 판단은 항상 그 서버에 조회해서 내려라.

## 새로 생겼거나 문법이 바뀐 것 (핵심)

가장 중요한 부분이다. 상세는 references 로 분리했다.

| 커맨드 | 상태 | 어디를 보라 |
|---|---|---|
| `/dialog` | 1.21.6 신규, 이 프로젝트의 핵심 | **[references/dialog.md](references/dialog.md)** |
| `/waypoint` | 1.21.6 신규, 26.2 에서 color 인자 엄격해짐 | [references/new-and-changed.md](references/new-and-changed.md) |
| `/time` | **26.1 에서 전면 재구성** (세계 시계) | [references/new-and-changed.md](references/new-and-changed.md) |
| `/swing` | **26.1 신규** | 아래 |
| `/fetchprofile entity` | **26.1 신규 서브커맨드** | 아래 |
| `/unpublish` | **26.2 신규** | 아래 |
| `/stopwatch` | 1.21.11 신규 | [references/new-and-changed.md](references/new-and-changed.md) |
| `/rotate` | 1.21.2 신규 | 아래 |
| `/transfer` | 1.20.5 신규 (전용 서버 전용) | 아래 |
| `/team modify color`, `/waypoint modify color` | **26.2 에서 문법 엄격해짐** | 아래 |
| `/execute on owner` | 26.2 에서 vex 포함 | 아래 |
| 텍스트 컴포넌트 `click_event`/`hover_event` | 1.21.5 에서 이름/필드 변경 | [references/new-and-changed.md](references/new-and-changed.md) |

빠르게 쓸 수 있는 폼:

```mcfunction
# /swing — 26.1 신규. 두 인자 모두 생략 가능 (@s, mainhand)
swing
swing @a
swing @e[type=zombie,limit=5] offhand

# /rotate — yaw pitch 또는 facing
rotate @s 90 0
rotate @s facing 100 64 200
rotate @s facing entity @p eyes

# /unpublish — 26.2 신규. 인자 없음. 싱글플레이(통합 서버) 전용, 권한 4
unpublish

# /fetchprofile — 26.1 에서 entity 추가
fetchprofile name Notch
fetchprofile id 069a79f4-44e9-4726-a5be-fca90e38aaf5
fetchprofile entity @p

# /transfer — 전용 서버에서만 동작, 권한 3
transfer example.com
transfer example.com 25565 @a
```

### 26.2 에서 실제로 바뀐 동작 3가지

1. **팀/웨이포인트 색상 인자가 엄격해졌다.** `/team modify <team> color` 와 `/waypoint modify <t> color` 는 이제 **소문자 + 언더스코어**만 받는다. 텍스트 컴포넌트의 색 이름과 일치한다.
   - OK: `dark_purple`, `light_purple`, `dark_aqua`
   - 거부: `darkpurple`, `DarkPurple`, `DARK_PURPLE`
2. `/execute on owner` 가 **vex 를 evoker 소유로** 취급한다.
3. advancement 부여/회수 시 출력 메시지가 "몇 개의 어드밴스먼트가 / 몇 명의 플레이어에게 변경되었는지"를 보고하도록 바뀌었다. (`/execute store result` 로 세는 값이 달라질 수 있다)

## 안 바뀐 것들 (기억대로 써도 된다)

다음은 1.21 시절과 실질적으로 동일하다. 굳이 이 문서에서 반복하지 않는다:

`give`, `teleport`/`tp`, `fill`, `setblock`, `summon`, `kill`,
`gamemode`, `gamerule`, `difficulty`, `weather`, `enchant`, `experience`/`xp`,
`scoreboard`, `team`(색상 인자 제외), `tag`, `execute`(owner 변경 제외), `function`, `schedule`,
`particle`, `playsound`/`stopsound`, `title`, `tellraw`(컴포넌트 포맷은 아래 주의), `say`, `msg`,
`worldborder`, `spreadplayers`, `forceload`, `locate`, `place`, `loot`, `ride`, `damage`, `attribute`,
`random`, `return`, `tick`, `datapack`, `whitelist`/`op`/`ban` 계열.

`tellraw`/`title`/책 등 **텍스트 컴포넌트를 쓸 때는 반드시** [references/new-and-changed.md](references/new-and-changed.md) 의 click_event 섹션을 확인해라. 여기서 가장 자주 틀린다.

## 모드 커맨드

- **WorldEdit** (`//set`, `//pos1`, `//copy` …) → [references/worldedit-baritone.md](references/worldedit-baritone.md)
- **Baritone** (`#goto`, `#mine`, `#sel` …) → [references/worldedit-baritone.md](references/worldedit-baritone.md)
