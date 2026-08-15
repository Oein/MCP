# 26.x 신규 / 변경 커맨드 상세

`/dialog` 는 별도 문서: [dialog.md](dialog.md)

---

## /waypoint (1.21.6 신규, 26.2 에서 color 인자 변경)

로케이터 바(locator bar)에 표시되는 웨이포인트를 관리한다. 권한 2, Java 전용.

```mcfunction
waypoint list

waypoint modify <waypoint> color <color>
waypoint modify <waypoint> color hex <hex_color>
waypoint modify <waypoint> color reset

waypoint modify <waypoint> style set <style>
waypoint modify <waypoint> style reset
```

- `<waypoint>` — **엔티티 인자**다. 웨이포인트 이름이 아니라 웨이포인트를 가진 엔티티를 가리킨다
  (플레이어 이름, 단일 대상 셀렉터, UUID).
- `<color>` — 16색 이름. **26.2 부터 소문자+언더스코어만 허용**: `dark_purple` ✅ / `darkpurple` ❌ / `DarkPurple` ❌
- `<hex_color>` — `RRGGBB` 6자리 16진수 (`000000`~`FFFFFF`)
- `<style>` — 리소스팩이 제공하는 웨이포인트 스타일의 resource location

예:
```mcfunction
waypoint list
waypoint modify @s color light_blue
waypoint modify Steve color hex FF8800
waypoint modify @p color reset
waypoint modify @s style set minecraft:bowtie
waypoint modify @s style reset
```

> `fade` 관련 인자는 25w17a 에서 **제거**되었다. 쓰지 마라.
> 위키 문서에는 `list`/`modify` 외 서브커맨드가 없다. 다른 것(예: `waypoint add`)이 필요하면
> 실행 중인 26.2 서버에서 확인한 전체 목록은 이게 전부다 (서브커맨드는 `list` 와 `modify` 둘뿐):
>
> ```
> /waypoint list
> /waypoint modify <waypoint> color <color>
> /waypoint modify <waypoint> color hex <color>
> /waypoint modify <waypoint> color reset
> /waypoint modify <waypoint> style reset
> /waypoint modify <waypoint> style set <style>
> ```

---

## /time — 26.1 에서 전면 재구성 (가장 위험한 변경)

26.1 스냅샷 3부터 `/time` 은 **세계 시계(world clock)** 기반으로 재구성되었다.
구버전 폼(`/time set day`, `/time add 1000`)의 상당수는 여전히 통하지만, **반환값과 의미가 달라졌고**
`of <clock>` / `rate` / `pause` / `resume` 이 새로 생겼다.

전체 폼:

```mcfunction
time [of <clock>] set <time>          # 총 경과 틱 수를 설정
time [of <clock>] set <timemarker>    # 다음 해당 시간 마커까지 진행 (day, night, noon, midnight 등)
time [of <clock>] add <time>          # 틱 가감 (음수 가능)
time [of <clock>] pause               # 시계 정지
time [of <clock>] resume              # 시계 재개
time [of <clock>] rate <rate>         # 진행 배율. 0 초과 ~ 1000 이하
time [of <clock>] query time          # 총 경과 틱
time [of <clock>] query <timeline>    # 해당 타임라인 주기 내 틱
time [of <clock>] query <timeline> repetition   # 반복 횟수
time query gametime                   # 시계 변경의 영향을 받지 않는 게임틱
```

핵심 차이:
- `of <clock>` 로 특정 시계를 지정할 수 있다. 생략 시 기본 시계.
- `rate` 는 26.1 Pre-Release 1 에서 추가되었다. `0 < rate <= 1000`.
- `set` / `add` 의 **반환값(return value)이 바뀌었다.** `/execute store result` 로 값을 받는
  기존 데이터팩은 26.1 에서 동작이 달라질 수 있다.
- `time query gametime` 은 시계 조작과 무관하게 게임 틱을 반환한다.

예:
```mcfunction
time set day
time set 6000
time add -1000
time rate 0.5
time pause
time resume
time query time
time query gametime
```

> `time query daytime` 은 **26.2 에 없다.** 1.21 이하의 문법이며, 실행하면
> `Can't find element 'minecraft:daytime' of type 'minecraft:timeline'` 이 나온다.
> 현재 시각은 `time query time` 이고, 응답은
> `Clock minecraft:overworld is at 1892 tick(s)` 형태다.

> `<clock>` 과 `<timeline>` 에 어떤 값이 들어갈 수 있는지는 서버/데이터팩 레지스트리에 달려 있다.
> 실행 중인 26.2 서버에서 확인한 형태:
>
> ```
> /time set <time> | set <timemarker> | add <time>
> /time pause | resume | rate <rate>
> /time query time | query gametime | query <timeline> [repetition]
> /time of <clock> set <time> | of <clock> set <timemarker>
> ```
>
> `<clock>` / `<timeline>` 의 유효값은 레지스트리에서 오므로 월드마다 다르다.
> `mc_command_syntax command="time"` 또는 `mc_registry` 로 확인해라.
> **`/time query daytime` 은 없다** — 26.x 에서 사라졌다. `query time` 을 써라.

---

## /stopwatch (1.21.11 신규)

실시간(real-time) 스톱워치. 게임 틱이 아니라 실제 경과 시간을 잰다. 권한 2, Java 전용.

```mcfunction
stopwatch create <id>
stopwatch query <id> [<scale>]
stopwatch restart <id>
stopwatch remove <id>
```

- `<id>` — **resource location** (예: `mypack:race_timer`). 임의의 단어가 아니다.
- `create` 는 생성과 동시에 시작한다.
- `query` 는 **초 단위**로 경과 시간을 반환한다. `<scale>` (double) 을 주면 결과에 곱해진다.
  예: 밀리초로 받고 싶으면 `scale` 에 `1000`.
- `query` 는 25w42a 부터 조회한 값을 **커맨드 반환값으로 돌려준다** → `/execute store result` 로 받을 수 있다.

예:
```mcfunction
stopwatch create mypack:race
execute store result score @s time run stopwatch query mypack:race 1000
stopwatch restart mypack:race
stopwatch remove mypack:race
```

> 25w42a 에서 id 인자의 **순서가 바뀌었다.** 구버전 기억(`stopwatch query <scale> <id>` 등)을 믿지 마라.

---

## /swing (26.1 신규)

엔티티의 팔 휘두르기 애니메이션을 재생한다.

```mcfunction
swing [<targets>] [<hand>]
```

- 두 인자 모두 선택. 기본값은 `@s` 와 `mainhand`.
- `<hand>` — `mainhand` 또는 `offhand`
- 스윙 패킷이 전송된 엔티티 수를 반환한다.

```mcfunction
swing
swing @a
swing @e[type=minecraft:zombie,limit=5] offhand
execute store result score #n count run swing @a mainhand
```

---

## /fetchprofile (1.21.9 신규, 26.1 에서 entity 추가)

플레이어 프로필을 Mojang 서버에서 비동기로 가져온다. 권한 2.

```mcfunction
fetchprofile name <name>
fetchprofile id <id>
fetchprofile entity <entity>    # 26.1 신규
```

- `name` — 대소문자 무시. 오프라인 플레이어도 가능.
- `id` — 하이픈 포함 UUID
- `entity` — **온라인 플레이어** 또는 Mannequin. 셀렉터/이름/UUID.
- 1.21.9 Pre-Release 1 부터 결과에 "해당 프로필로 Mannequin 소환" 클릭 텍스트가 붙는다.

---

## /unpublish (26.2 신규)

```mcfunction
unpublish
```

- 인자 없음. 권한 4. **싱글플레이(통합 서버) 전용** — 전용 서버에는 없다.
- 열려 있는 LAN 월드를 닫는다.
- 알려진 버그(MC-308405): 이미 published 가 아닐 때도 실패 메시지와 함께 성공을 반환한다.
  26.3 에서 수정 예정. **26.2 에서는 `/execute store success` 결과를 신뢰하지 마라.**

관련: `/publish`
```mcfunction
publish [<allowCommands>] [<gamemode>] [<port>]
```
- 26.2 기준 `gamemode` 인자가 **아직 있다.** (26.3 에서 제거 예정 — 26.3 문법을 미리 쓰지 마라)
- 26.2 스냅샷 8 에 잠깐 추가되었던 `online` 인자는 pre1 에서 **되돌려졌다.** 26.2 정식에는 없다.

---

## /rotate (1.21.2 신규)

엔티티의 회전만 바꾼다 (위치는 그대로). 권한 2, Java 전용.

```mcfunction
rotate <target> <rotation>
rotate <target> facing <facingLocation>
rotate <target> facing entity <facingEntity> [<facingAnchor>]
```

- `<rotation>` — yaw pitch (도 단위). `~` 상대 표기 사용 가능
- `<facingAnchor>` — `eyes` 또는 `feet` (기본 `feet`)

```mcfunction
rotate @s 90 0
rotate @s ~90 ~
rotate @e[type=armor_stand,limit=1] facing 100 64 200
rotate @s facing entity @p eyes
```

> `/tp <target> ~ ~ ~ <yaw> <pitch>` 로 회전만 바꾸던 구버전 습관 대신 `/rotate` 를 써라.

---

## /transfer (1.20.5 신규)

```mcfunction
transfer <hostname> [<port>] [<players>]
```
- `port` 생략 시 25565. `players` 생략 시 실행자.
- 권한 3. **전용 서버에서만 동작한다.**

---

## 디버그 전용 커맨드 (일반 서버엔 없다)

다음은 JVM 시스템 프로퍼티가 있어야 등록된다. 없으면 `mc_command_syntax` 목록에도 안 나온다.

| 커맨드 | 필요 프로퍼티 | 문법 |
|---|---|---|
| `chase` | `-DMC_DEBUG_CHASE_COMMAND` | `chase lead [<bind_address>] [<port>]` / `chase follow [<host>] [<port>]` / `chase stop` |
| `debugconfig` | `-DMC_DEBUG_DEV_COMMANDS` | `debugconfig config <target>` / `debugconfig unconfig <uuid>` / `debugconfig dialog <uuid> <dialog>` |
| `serverpack` | `-DMC_DEBUG_DEV_COMMANDS` | `serverpack push <url> [<uuid>] [<hash>]` / `serverpack pop <uuid>` |
| `spawn_armor_trims` | `-DMC_DEBUG_DEV_COMMANDS` | `spawn_armor_trims *_lag_my_game` / `spawn_armor_trims <pattern>` |

- `chase` 기본값: 주소 `localhost`, 포트 `10000`. `lead` 포트는 1024~65535, `follow` 는 1~65535. 권한 0.
- `debugconfig` 는 권한 3, 멀티플레이 전용. `config` 는 엔티티 인자, `unconfig`/`dialog` 는 하이픈 UUID 를 받는다.
  `dialog` 의 `<dialog>` 는 dialog ID 또는 인라인 SNBT.
- `serverpack push` 의 `<hash>` 는 SHA1. 권한 2.
- **커맨드 이름은 `spawnarmortrims` 가 아니라 `spawn_armor_trims`** (언더스코어) 다.

> 이들은 크래시나 세이브 손상을 일으킬 수 있다. 일반 플레이 중에 쓰지 마라.

---

## /test

위키상 1.21.5 (25w03a) 부터 일반 게임플레이에서 사용 가능하며, 서브커맨드는
`create`, `run`, `runclosest`, `runthat`, `runthese`, `runmultiple`, `runfailed`, `stop`,
`clearall`, `clearthat`, `clearthese`, `resetclosest`, `resetthat`, `resetthese`, `locate`, `pos`,
`verify`, `export*`(IDE 전용) 이다.

**단, 이 프로젝트의 26.2 jar 커맨드 추출 목록에는 `test` 가 없었다.**
빌드 구성에 따라 등록 여부가 다를 수 있으니 **쓰기 전에 반드시
`mc_command_syntax command="test"` 로 존재를 확인해라.**

---

## 26.2 에서 바뀐 동작

1. **색상 인자 엄격화** — `/team modify <team> color <color>` 와 `/waypoint modify <t> color <color>` 는
   소문자+언더스코어만 받는다. 텍스트 컴포넌트의 색 이름과 동일한 집합:
   `black, dark_blue, dark_green, dark_aqua, dark_red, dark_purple, gold, gray,
    dark_gray, blue, green, aqua, red, light_purple, yellow, white`
2. **`/execute on owner`** 가 vex 를 evoker 소유로 취급한다. `on owner` 로 소환수 체인을 타는
   데이터팩은 동작 범위가 넓어진다.
3. **advancement 출력 변경** — 여러 어드밴스먼트/여러 플레이어를 대상으로 부여·회수할 때,
   출력이 "변경된 어드밴스먼트 수" 및 "변경이 적용된 플레이어 수"를 보고한다.
   `/execute store result run advancement ...` 로 세던 값이 달라질 수 있다.
4. data pack / resource pack format 은 **`107.1`**. `pack.mcmeta` 의 `pack_format` 을 맞춰라.

---

## 텍스트 컴포넌트: click_event / hover_event (1.21.5 변경 — 매우 자주 틀림)

`tellraw`, `title`, `dialog` 의 텍스트, 책, sign 등 **모든 텍스트 컴포넌트**에 해당한다.
1.21.5 에서 필드 이름이 camelCase → snake_case 로 바뀌었고, `value` 가 액션별 전용 필드로 쪼개졌다.

### 틀린 (1.20/1.21 초기) 형태 — 26.2 에서 동작하지 않는다
```json
{"text":"클릭","clickEvent":{"action":"run_command","value":"/say hi"},
 "hoverEvent":{"action":"show_text","value":"툴팁"}}
```

### 올바른 26.2 형태
```json
{"text":"클릭","click_event":{"action":"run_command","command":"say hi"},
 "hover_event":{"action":"show_text","value":"툴팁"}}
```

click_event 액션별 필드:

| action | 필드 |
|---|---|
| `open_url` | `url` |
| `open_file` | `path` |
| `run_command` | `command` — `/` 접두사 불필요 |
| `suggest_command` | `command` |
| `change_page` | `page` — **문자열이 아니라 양의 정수** |
| `copy_to_clipboard` | `value` |
| `show_dialog` | `dialog` — dialog ID 또는 인라인 정의 |
| `custom` | `id`, `payload`(선택) |

hover_event:

| action | 필드 |
|---|---|
| `show_text` | `value` (텍스트 컴포넌트) |
| `show_item` | `id`, `count`, `components` 를 **인라인**으로 (더 이상 `contents` 로 감싸지 않음) |
| `show_entity` | `name`, `id`(구 `type`), `uuid`(구 `id`) 를 인라인으로 |

`show_entity` 의 필드 이름 교체(`type`→`id`, `id`→`uuid`)는 특히 실수하기 쉽다.

예:
```mcfunction
tellraw @a [{"text":"[메뉴 열기]","color":"aqua","click_event":{"action":"show_dialog","dialog":"mypack:welcome"},"hover_event":{"action":"show_text","value":"클릭하세요"}}]
```
