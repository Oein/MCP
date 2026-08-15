# /dialog 상세 (26.2)

`/dialog` 는 서버가 클라이언트에게 **UI 창**을 띄우는 커맨드다. 1.21.6 (25w20a) 에서 추가되었고 26.2 에도 그대로 있다.
1.20/1.21 초기 지식에는 **아예 없는 기능**이므로, 기억에 의존하지 말고 이 문서를 따라라.

## 커맨드 문법

서브커맨드는 **두 개뿐**이다.

```mcfunction
dialog show <targets> <dialog>
dialog clear <targets>
```

- `<targets>` — 플레이어 셀렉터 (`@p`, `@a`, 이름, UUID)
- `<dialog>` — 둘 중 하나:
  1. **등록된 dialog 의 resource location** (예: `mynamespace:welcome`)
  2. **인라인 SNBT dialog 정의** (아래 참조)
- `dialog clear` 는 대상 플레이어에게 열려 있는 dialog 를 닫는다.

권한 레벨 2.

## 두 가지 사용법

### A. 데이터팩에 등록해서 쓰기 (권장)

파일 위치:

```
data/<namespace>/dialog/<name>.json
```

예: `data/tutorial/dialog/welcome.json` → `/dialog show @a tutorial:welcome`

데이터팩을 수정한 뒤에는 `/reload` 를 실행해야 반영된다.

> **`/reload` 만으로는 부족하다 — 새로 추가한 dialog 는 재접속해야 보인다.** (실측 확인)
>
> dialog 는 `SYNCHRONIZED_REGISTRIES` 에 속한다. 이 레지스트리들은 **로그인(configuration 단계)
> 에서만** 클라이언트로 전송되고, `/reload` 는 서버쪽 데이터팩만 다시 읽을 뿐 그 단계를 다시
> 거치지 않는다. 그래서 방금 만든 dialog 는 클라이언트 사본에 없고, 이렇게 실패한다:
>
> ```
> /dialog show @s ns:greet
> → Can't find element 'ns:greet' in registry 'minecraft:dialog'
> ```
>
> **해결: 월드를 나갔다 다시 들어가라** (`mc_open_world` 에 `leaveCurrent:true`, 서버라면 재접속).
> 그러면 레지스트리에 나타나고 정상 동작한다. 파일 경로나 JSON 이 틀린 게 아니니
> 디버깅에 시간 쓰지 마라.
>
> 한 번만 띄우면 되는 경우라면 **인라인 폼(B)** 을 쓰는 게 훨씬 간단하다 — 인라인은
> 레지스트리를 거치지 않아 재접속이 필요 없다.

### B. 인라인 SNBT 로 쓰기

등록 없이 커맨드 한 줄에 정의를 직접 넣을 수 있다. JSON 구조를 SNBT 로 쓴다
(키는 따옴표 없이 써도 되고, 문자열은 `"` 또는 `'` 로 감싼다).

```mcfunction
dialog show @p {type:"minecraft:notice",title:"안녕하세요",body:[{type:"minecraft:plain_message",contents:"서버에 오신 것을 환영합니다."}],action:{label:"확인",action:{type:"minecraft:run_command",command:"say 확인 눌렀음"}}}
```

인라인은 따옴표 이스케이프가 금방 지옥이 되므로, **조금이라도 복잡하면 데이터팩 파일로 만들어라.**
(참고: `/debugconfig dialog <uuid> <dialog>` 도 동일하게 ID 또는 인라인 SNBT 를 받는다.)

## Dialog 정의 구조

### 공통 필드 (모든 type 공통)

| 필드 | 타입 | 설명 |
|---|---|---|
| `type` | **필수** | `minecraft:dialog_type` 레지스트리의 ID. 아래 5종 |
| `title` | **필수** | 텍스트 컴포넌트. 창 제목 |
| `external_title` | 선택 | 다른 dialog 에서 이 dialog 를 여는 버튼의 라벨 |
| `body` | 선택 | body element 하나 또는 리스트 |
| `inputs` | 선택 | 입력 컨트롤 리스트 |
| `can_close_with_escape` | 선택 bool | 기본 `true` |
| `pause` | 선택 bool | 싱글플레이에서 게임 일시정지 여부. 기본 `true` |
| `after_action` | 선택 | `close`(기본) / `none` / `wait_for_response` |

### type 5종

| type | 전용 필드 |
|---|---|
| `minecraft:notice` | `action` — 버튼 1개 (기본값 있음) |
| `minecraft:confirmation` | `yes`, `no` — 버튼 각 1개 (둘 다 필수) |
| `minecraft:multi_action` | `actions`(비어있지 않은 버튼 리스트, 필수), `columns`(기본 2), `exit_action`(선택) |
| `minecraft:server_links` | `exit_action`(선택), `columns`(기본 2), `button_width`(1~1024, 기본 150) |
| `minecraft:dialog_list` | `dialogs`(필수: dialog ID / 정의 / 태그 / 배열), `exit_action`(선택), `columns`(기본 2), `button_width`(기본 150) |

### body element 2종

**`minecraft:plain_message`** — 여러 줄 텍스트
```json
{ "type": "minecraft:plain_message", "contents": "표시할 텍스트", "width": 200 }
```
- `contents`: 텍스트 컴포넌트. **NBT / score / selector 컴포넌트는 사용 불가.**
- `width`: 1~1024, 기본 200

**`minecraft:item`** — 아이템 아이콘
```json
{
  "type": "minecraft:item",
  "item": { "id": "minecraft:diamond_sword", "count": 1 },
  "description": { "contents": "전설의 검", "width": 200 },
  "show_decoration": true,
  "show_tooltip": true,
  "width": 16,
  "height": 16
}
```
- `item`: 필수. `id` 필수, `count`/`components` 선택
- `width`/`height`: 1~256, 기본 16

### 버튼(action) 객체

`notice.action`, `confirmation.yes/no`, `multi_action.actions[]`, `exit_action` 에 들어가는 형태:

```json
{
  "label": "버튼 텍스트",
  "tooltip": "마우스 올렸을 때(선택)",
  "width": 150,
  "action": { "type": "minecraft:run_command", "command": "say hi" }
}
```
- `label` 필수, `tooltip`/`width` 선택 (`width` 1~1024, 기본 150)
- `action` **생략 가능** — 생략하면 그냥 dialog 를 닫는 버튼이 된다.

### 입력 컨트롤 (`inputs`)

모두 `type`, `key`, `label` 이 필요하다. `key` 는 나중에 `$(key)` 매크로로 참조된다.

**`minecraft:text`** — 한 줄/여러 줄 텍스트 입력
```json
{
  "type": "minecraft:text",
  "key": "message",
  "label": "메시지",
  "initial": "",
  "max_length": 32,
  "width": 200,
  "label_visible": true,
  "multiline": { "max_lines": 4, "height": 80 }
}
```
- `max_length` 기본 **32** (짧다! 긴 입력이 필요하면 반드시 명시)
- `multiline` 은 선택. `height` 는 1~512

**`minecraft:boolean`** — 체크박스
```json
{
  "type": "minecraft:boolean",
  "key": "hardcore",
  "label": "하드코어",
  "initial": false,
  "on_true": "true",
  "on_false": "false"
}
```
- `on_true`/`on_false` 는 매크로에 치환될 **문자열**이다. 기본 `"true"`/`"false"`.
  `"on_true": "@a", "on_false": "@s"` 처럼 커맨드 조각을 넣는 트릭이 가능하다.

**`minecraft:single_option`** — 드롭다운
```json
{
  "type": "minecraft:single_option",
  "key": "difficulty",
  "label": "난이도",
  "width": 200,
  "label_visible": true,
  "options": [
    { "id": "peaceful", "display": "평화로움", "initial": true },
    { "id": "easy",     "display": "쉬움" },
    { "id": "hard",     "display": "어려움" }
  ]
}
```
- `options` 는 비어 있으면 안 된다. 각 항목은 `id` 필수, `display`/`initial` 선택.
- 매크로에는 선택된 항목의 `id` 가 들어간다.

**`minecraft:number_range`** — 슬라이더
```json
{
  "type": "minecraft:number_range",
  "key": "radius",
  "label": "반경",
  "start": 1.0,
  "end": 64.0,
  "step": 1.0,
  "initial": 16.0,
  "width": 200,
  "label_format": "options.generic_value"
}
```
- `start`, `end` 필수(float). `step` 선택. `initial` 생략 시 범위 중앙값.
- `label_format` 은 번역 키, 기본 `options.generic_value`.

### action 종류

**정적 (입력값과 무관)**

| type | 필드 |
|---|---|
| `minecraft:open_url` | `url` |
| `minecraft:run_command` | `command` (`/` 접두사 불필요) |
| `minecraft:suggest_command` | `command` |
| `minecraft:change_page` | `page` (양의 정수) |
| `minecraft:copy_to_clipboard` | `value` |
| `minecraft:show_dialog` | `dialog` (ID 또는 인라인 정의) |
| `minecraft:custom` | `id`, `payload`(선택) |

**동적 (입력값을 사용)**

| type | 필드 |
|---|---|
| `minecraft:dynamic/run_command` | `template` — `$(key)` 매크로 문자열 |
| `minecraft:dynamic/custom` | `id`, `additions`(선택 compound) |

`dynamic/run_command` 의 `template` 은 입력 컨트롤의 `key` 를 `$(key)` 로 치환한다.
예: `key` 가 `message` 인 text 입력이 있으면 `"template": "say $(message)"`.

> `minecraft:custom` / `dynamic/custom` 은 클라이언트가 서버로 커스텀 payload 를 보내는 것으로,
> 모드/플러그인이 받아 처리해야 의미가 있다. 바닐라만으로는 아무 일도 안 일어난다.

## 완성 예제

### 1. notice — 단순 안내창

`data/mypack/dialog/welcome.json`
```json
{
  "type": "minecraft:notice",
  "title": { "text": "환영합니다", "color": "gold", "bold": true },
  "body": [
    { "type": "minecraft:plain_message", "contents": "이 서버에 처음 오셨군요!" },
    {
      "type": "minecraft:item",
      "item": { "id": "minecraft:bread", "count": 3 },
      "description": { "contents": "시작 아이템을 드립니다." }
    }
  ],
  "can_close_with_escape": true,
  "action": {
    "label": "받기",
    "action": { "type": "minecraft:run_command", "command": "give @s bread 3" }
  }
}
```
```mcfunction
dialog show @a mypack:welcome
```

### 2. confirmation — 예/아니오

```json
{
  "type": "minecraft:confirmation",
  "title": "정말 초기화할까요?",
  "body": { "type": "minecraft:plain_message", "contents": "인벤토리가 전부 삭제됩니다." },
  "yes": {
    "label": "네",
    "tooltip": "되돌릴 수 없습니다",
    "action": { "type": "minecraft:run_command", "command": "clear @s" }
  },
  "no": { "label": "아니오" }
}
```

### 3. multi_action + 입력 + 동적 커맨드

```json
{
  "type": "minecraft:multi_action",
  "title": "텔레포트 도구",
  "external_title": "TP",
  "body": { "type": "minecraft:plain_message", "contents": "목적지를 고르세요." },
  "inputs": [
    {
      "type": "minecraft:single_option",
      "key": "dest",
      "label": "목적지",
      "options": [
        { "id": "spawn",  "display": "스폰",   "initial": true },
        { "id": "nether", "display": "네더" }
      ]
    },
    {
      "type": "minecraft:number_range",
      "key": "height",
      "label": "높이",
      "start": 0.0, "end": 320.0, "step": 1.0, "initial": 64.0
    },
    {
      "type": "minecraft:boolean",
      "key": "silent",
      "label": "조용히 이동"
    }
  ],
  "columns": 2,
  "actions": [
    {
      "label": "이동",
      "action": {
        "type": "minecraft:dynamic/run_command",
        "template": "function mypack:tp_to/$(dest) {height:$(height),silent:$(silent)}"
      }
    },
    {
      "label": "도움말",
      "action": { "type": "minecraft:open_url", "url": "https://example.com/help" }
    }
  ],
  "exit_action": { "label": "닫기" }
}
```

### 4. dialog_list — 메뉴 허브

```json
{
  "type": "minecraft:dialog_list",
  "title": "서버 메뉴",
  "dialogs": ["mypack:welcome", "mypack:teleport", "mypack:settings"],
  "columns": 1,
  "button_width": 200,
  "exit_action": { "label": "닫기" }
}
```
`dialogs` 에는 ID 배열 외에 태그(`"#mypack:menus"`)나 인라인 정의도 넣을 수 있다.

## 내장 dialog 와 태그

레지스트리 태그로 dialog 를 게임 UI 에 자동으로 꽂을 수 있다.

- `#minecraft:pause_screen_additions` — 일시정지 화면에 항목 추가
- `#minecraft:quick_actions` — 퀵 액션 단축키 목록에 추가

내장 dialog ID:
- `minecraft:custom_options` — pause_screen_additions 태그에 여러 dialog 가 있을 때 표시되는 목록
- `minecraft:quick_actions` — quick_actions 태그에 여러 dialog 가 있을 때 표시되는 목록
- `minecraft:server_links` — 서버 링크 목록 (빈 내장 dialog)

태그 파일 위치: `data/<namespace>/tags/dialog/<tag_name>.json`
```json
{ "values": ["mypack:welcome", "mypack:teleport"] }
```

## 버튼을 눌렀을 때 뜨는 확인 창 (실측)

`run_command` / `dynamic/run_command` 버튼을 누르면 dialog 가 바로 실행되지 않고
바닐라의 **`ConfirmScreen` (제목 `Confirm Command Execution`)** 이 먼저 뜬다.
`mc_screen` 으로 보면 `isDialog` 는 `false` 이고 버튼이 두 개다.

- 권한이 필요한 커맨드 (`time set` 등)
  → `You are trying to execute a command that requires elevated permissions.`
  → 버튼: **`Run Command`** / `Back`. `Run Command` 를 눌러야 실제로 실행된다.
- 채팅 메시지를 보내는 커맨드 (`say`, `me`, `msg` 등)
  → `You are trying to execute a command that will send chat messages using your name.`
  `It can only be run from the chat screen`
  → 버튼: **`Copy to Chat Screen`** / `Back`. **`Run Command` 버튼이 없다** —
  즉 dialog 에서 `say` 류는 바로 실행할 수 없다. 테스트용 커맨드로 `say` 를 쓰면
  "dialog 가 안 된다" 고 오해하기 쉬우니 `time set` 같은 걸 써라.

확인 창에도 실제로 치환된 커맨드가 `Command: time set 18000` 형태로 표시되므로,
`dynamic/run_command` 의 `$(key)` 매크로가 제대로 들어갔는지 여기서 검증할 수 있다.

## 입력 칸을 라벨로 지정할 때

`label_visible` 이 켜진 입력은 화면에 **캡션 위젯과 입력 위젯 두 개**가 같은 텍스트로
올라온다. `mc_screen` 결과에서 입력 쪽은 `kind:"input"` 이 붙어 있으니 그걸 보고
고르면 된다 (`mc_screen_input` 은 라벨로 지정해도 입력 위젯을 먼저 찾는다).

## 흔한 실수

- `/dialog open` 이나 `/dialog close` 는 **없다.** `show` 와 `clear` 뿐이다.
- `type` 에 네임스페이스를 빼먹는 것 — `"notice"` 대신 `"minecraft:notice"` 를 쓰는 게 안전하다.
- action `type` 도 마찬가지로 `minecraft:run_command` 처럼 네임스페이스를 붙여라.
- text 입력 `max_length` 기본값이 32 라는 것을 잊고 긴 입력을 기대하는 것.
- `dynamic/run_command` 가 아닌 `run_command` 에 `$(key)` 를 쓰는 것 — 치환되지 않는다.
- 데이터팩 파일 폴더는 `dialogs` 가 아니라 **`dialog`** (단수).

## 확실하지 않으면

```
mc_command_syntax  command="dialog"
```
로 실제 서버가 받아들이는 usage 를 확인해라. dialog 정의 JSON 자체의 오류는 커맨드 실행 시
파싱 에러 메시지로 나오므로, 실패하면 메시지를 그대로 읽고 필드 이름을 고쳐라.
