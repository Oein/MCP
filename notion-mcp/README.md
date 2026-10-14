# Notion MCP Server

Notion API의 거의 모든 기능을 MCP(Model Context Protocol) 도구로 제공하는 서버입니다.

## 설치

```bash
npm install
npm run build
```

## 설정

### 1. Notion Integration 토큰 발급

[Notion Integrations](https://www.notion.so/profile/integrations)에서 새 Integration을 생성하고 토큰을 복사합니다.

### 2. 워크스페이스 연결

사용할 페이지/데이터베이스에서 **··· → 연결 → Integration 선택**으로 접근 권한을 부여합니다.

### 3. Claude Code에 추가

**방법 A: CLI 명령어 (권장)**

```bash
claude mcp add-json notion '{
  "command": "node",
  "args": ["/절대경로/notion-mcp/dist/index.js"],
  "env": {
    "NOTION_API_KEY": "ntn_여기에토큰"
  }
}'
```

> `-s user`를 붙이면 전역 설정에, 기본은 프로젝트 로컬 설정에 추가됩니다.

**방법 B: 설정 파일 직접 수정**

`~/.claude.json` (프로젝트별) 또는 `~/.claude/settings.json` (전역)에 추가:

```json
{
  "mcpServers": {
    "notion": {
      "command": "node",
      "args": ["/절대경로/notion-mcp/dist/index.js"],
      "env": {
        "NOTION_API_KEY": "ntn_..."
      }
    }
  }
}
```

> 설정 후 Claude Code를 재시작해야 MCP 서버가 연결됩니다.

**연결 확인:**

```bash
claude mcp list
```

`notion: ... - ✔ Connected`가 표시되면 정상입니다.

## 도구 목록

### Pages

| 도구 | 설명 |
|------|------|
| `create_page` | 페이지 생성. DB 또는 페이지 하위에 생성 가능. 아이콘, 커버, 블록 콘텐츠 포함 |
| `get_page` | 페이지 조회 (속성 포함) |
| `update_page` | 페이지 속성, 아이콘, 커버 수정. 아카이브/복원 |
| `get_page_property` | 특정 속성값 조회 (페이지네이션 지원) |

### Blocks

| 도구 | 설명 |
|------|------|
| `get_block` | 단일 블록 조회 |
| `update_block` | 블록 내용 수정 |
| `delete_block` | 블록 삭제 (휴지통으로 이동, 복원 가능) |
| `get_block_children` | 하위 블록 목록 조회 (페이지네이션) |
| `append_block_children` | 하위에 블록 추가. `after`로 특정 위치에 삽입 가능 |

### Databases

| 도구 | 설명 |
|------|------|
| `create_database` | 데이터베이스 생성. 모든 속성 타입 지원 |
| `get_database` | 데이터베이스 스키마 조회 |
| `update_database` | 제목, 설명, 속성 스키마 수정. 속성 추가/삭제/이름변경 |
| `query_database` | 필터 + 정렬로 데이터베이스 쿼리 |

### Search · Users · Comments

| 도구 | 설명 |
|------|------|
| `search` | 페이지/데이터베이스 검색 |
| `list_users` | 워크스페이스 사용자 목록 |
| `get_user` | 사용자 정보 조회 |
| `get_me` | 현재 봇 사용자 정보 |
| `create_comment` | 페이지/블록에 댓글 작성 또는 스레드 답글 |
| `get_comments` | 댓글 목록 조회 |

### 편의 도구

| 도구 | 설명 |
|------|------|
| `get_page_content` | 페이지 메타데이터 + 전체 블록을 재귀적으로 조회 |
| `batch_update_blocks` | 여러 블록 일괄 수정 |
| `move_block` | 블록을 다른 부모로 이동 |
| `replace_block_content` | 블록의 rich_text를 통째로 교체 |
| `append_text_to_block` | 기존 블록 텍스트 뒤에 추가 |
| `database_add_item` | 데이터베이스에 항목 추가 (간편 버전) |

## 사용 예시

### 페이지 생성

```json
{
  "tool": "create_page",
  "arguments": {
    "parent": { "page_id": "부모-페이지-ID" },
    "properties": {
      "title": [{ "text": { "content": "새 페이지" } }]
    },
    "children": [
      {
        "type": "heading_1",
        "heading_1": {
          "rich_text": [{ "type": "text", "text": { "content": "제목" } }]
        }
      },
      {
        "type": "paragraph",
        "paragraph": {
          "rich_text": [
            {
              "type": "text",
              "text": { "content": "굵은 텍스트" },
              "annotations": { "bold": true }
            }
          ]
        }
      }
    ],
    "icon": { "type": "emoji", "emoji": "📝" }
  }
}
```

### 데이터베이스 생성

```json
{
  "tool": "create_database",
  "arguments": {
    "parent": { "page_id": "부모-페이지-ID" },
    "title": [{ "type": "text", "text": { "content": "작업 목록" } }],
    "properties": {
      "이름": { "title": {} },
      "상태": {
        "select": {
          "options": [
            { "name": "할 일", "color": "red" },
            { "name": "진행 중", "color": "yellow" },
            { "name": "완료", "color": "green" }
          ]
        }
      },
      "우선순위": { "number": { "format": "number" } },
      "마감일": { "date": {} },
      "담당자": { "people": {} },
      "태그": {
        "multi_select": {
          "options": [
            { "name": "버그" },
            { "name": "기능" },
            { "name": "개선" }
          ]
        }
      }
    }
  }
}
```

### 데이터베이스 쿼리 (필터 + 정렬)

```json
{
  "tool": "query_database",
  "arguments": {
    "database_id": "DB-ID",
    "filter": {
      "and": [
        { "property": "상태", "select": { "does_not_equal": "완료" } },
        { "property": "우선순위", "number": { "greater_than": 2 } }
      ]
    },
    "sorts": [
      { "property": "우선순위", "direction": "descending" },
      { "property": "마감일", "direction": "ascending" }
    ]
  }
}
```

### 특정 위치에 블록 삽입

```json
{
  "tool": "append_block_children",
  "arguments": {
    "block_id": "페이지-또는-블록-ID",
    "after": "이-블록-다음에-삽입할-블록-ID",
    "children": [
      {
        "type": "callout",
        "callout": {
          "rich_text": [{ "type": "text", "text": { "content": "중요한 내용" } }],
          "icon": { "type": "emoji", "emoji": "⚠️" },
          "color": "yellow_background"
        }
      }
    ]
  }
}
```

### 블록 이동

```json
{
  "tool": "move_block",
  "arguments": {
    "block_id": "이동할-블록-ID",
    "target_parent_id": "새-부모-ID",
    "after": "이-블록-뒤에-삽입"
  }
}
```

## 지원 블록 타입

`paragraph`, `heading_1`, `heading_2`, `heading_3`, `bulleted_list_item`, `numbered_list_item`, `to_do`, `toggle`, `quote`, `callout`, `code`, `equation`, `divider`, `table_of_contents`, `breadcrumb`, `column_list`, `column`, `table`, `table_row`, `image`, `video`, `audio`, `file`, `pdf`, `bookmark`, `embed`, `synced_block`, `link_to_page`

## 지원 DB 속성 타입

`title`, `rich_text`, `number`, `select`, `multi_select`, `status`, `date`, `people`, `files`, `checkbox`, `url`, `email`, `phone_number`, `formula`, `relation`, `rollup`, `created_time`, `created_by`, `last_edited_time`, `last_edited_by`, `unique_id`

## Rich Text 서식

```json
{
  "type": "text",
  "text": { "content": "텍스트", "link": { "url": "https://..." } },
  "annotations": {
    "bold": true,
    "italic": false,
    "strikethrough": false,
    "underline": false,
    "code": false,
    "color": "red"
  }
}
```

색상: `default`, `gray`, `brown`, `orange`, `yellow`, `green`, `blue`, `purple`, `pink`, `red` + 각각의 `_background` 변형

## 필터 조건 요약

| 속성 타입 | 사용 가능한 조건 |
|----------|----------------|
| `rich_text` | `equals`, `does_not_equal`, `contains`, `does_not_contain`, `starts_with`, `ends_with`, `is_empty`, `is_not_empty` |
| `number` | `equals`, `does_not_equal`, `greater_than`, `greater_than_or_equal_to`, `less_than`, `less_than_or_equal_to`, `is_empty`, `is_not_empty` |
| `select` | `equals`, `does_not_equal`, `is_empty`, `is_not_empty` |
| `multi_select` | `contains`, `does_not_contain`, `is_empty`, `is_not_empty` |
| `date` | `equals`, `before`, `after`, `on_or_before`, `on_or_after`, `is_empty`, `is_not_empty`, `past_week`, `past_month`, `past_year`, `next_week`, `next_month`, `next_year`, `this_week` |
| `checkbox` | `equals`, `does_not_equal` |
| `people` | `contains`, `does_not_contain`, `is_empty`, `is_not_empty` |
| `relation` | `contains`, `does_not_contain`, `is_empty`, `is_not_empty` |
