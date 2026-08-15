# 조선왕조실록 MCP 서버

국사편찬위원회 [조선왕조실록](https://sillok.history.go.kr)을 검색하고 읽을 수 있게 해주는
MCP(Model Context Protocol) 서버입니다. 국역문·한문 원문 전문 검색, 기사 원문 열람,
왕대·연·월·일자 단위 탐색을 지원합니다.

실록 사이트는 공개 API를 제공하지 않으므로 웹 페이지를 요청해 HTML을 파싱합니다.
자료의 저작권과 이용 조건은 국사편찬위원회의 정책을 따릅니다.

## 설치

```bash
npm install
npm run build
```

## 등록

Claude Code:

```bash
claude mcp add choson-sillok -- node /absolute/path/to/MCP/choson-sillok-mcp/dist/index.js
```

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "choson-sillok": {
      "command": "node",
      "args": ["/absolute/path/to/MCP/choson-sillok-mcp/dist/index.js"]
    }
  }
}
```

## 도구

| 도구 | 설명 |
| --- | --- |
| `search_sillok` | 키워드로 실록 전문 검색 (국역/원문, 왕대 필터, 페이지, 정렬) |
| `get_sillok_article` | 기사 ID로 국역문·한문 원문·각주·분류 전문 조회 |
| `list_sillok_kings` | 실록 33종의 왕대 코드와 이름 |
| `list_sillok_months` | 한 왕대의 연도별 월 목록 (윤달 포함) |
| `list_sillok_day` | 특정 월/일자의 기사 제목 목록 |

### search_sillok

| 인자 | 설명 |
| --- | --- |
| `query` | 검색어 (한글 또는 한자, 100자 이내) |
| `target` | `translation`(국역, 기본) 또는 `original`(한문 원문) |
| `king` | `"세종실록"`처럼 실록 이름으로 결과 제한 |
| `page` | 페이지 번호 (기본 1) |
| `perPage` | `10`(기본) · `50` · `100` — 사이트가 허용하는 값 |
| `sort` | `period`(시대순, 기본) 또는 `accuracy`(정확도순) |

결과에는 기사 ID, 출처 표기, 제목, 검색어 주변 발췌문과 함께 국역/원문 전체 적중 건수,
왕대별 적중 건수가 담깁니다.

```jsonc
{
  "query": "훈민정음",
  "totalTranslation": 11,
  "totalOriginal": 10,
  "byKing": [{ "name": "세종", "count": 5 }, ...],
  "hits": [
    {
      "id": "kda_12512030_002",
      "citation": "세종실록 102권, 세종 25년 12월 30일 경술 2번째기사",
      "title": "훈민정음을 창제하다",
      "snippet": "이달에 임금이 친히 언문(諺文) 28자(字)를 지었는데 …",
      "url": "https://sillok.history.go.kr/id/kda_12512030_002"
    }
  ]
}
```

### 기사 ID 읽는 법

`kda_12512030_002`은 `kda`(세종실록) 뒤에 `1`(본문 구분) · `25`(재위 25년) ·
`12`(월) · `0`(윤달이면 1) · `30`(일) · `_002`(그날의 2번째 기사)가 이어진 형태입니다.
월 단위 ID는 일자를 뺀 `kda_125120`이 됩니다. 즉위년은 연도 자리가 `00`입니다.

국역 기사는 `k`로, 한문 원문 기사는 `w`로 시작합니다(`wda_12512030_002`).
`get_sillok_article`은 어느 쪽 ID를 주든 국역문과 원문을 함께 돌려줍니다.

### 탐색 흐름

```
list_sillok_kings  →  kda (세종실록)
list_sillok_months →  kda_125120 (세종 25년 12월)
list_sillok_day    →  kda_12512030_002 (그날의 기사 목록)
get_sillok_article →  기사 전문
```

## 구현 메모

사이트 동작 중 재현에 주의가 필요한 부분입니다.

- 검색은 `POST /search/searchResultList.do`, 검색어 필드는 `topSearchWord`입니다.
- 왕대 필터·페이지 이동은 직전 검색 결과 폼의 hidden 필드(전체 건수 등)를 그대로
  되돌려 보내야 합니다. 값이 빠지면 서버가 0건을 반환하므로 요청을 2단계로 나눕니다.
- 페이지당 건수는 폼 필드가 아니라 `sillok_op_search_pageUnit` 쿠키로 전달됩니다.
- 정확도순 정렬 값은 `accuracy`가 아니라 `correct`입니다.

## 라이선스

MIT (코드 한정). 실록 원문·번역문의 권리는 국사편찬위원회에 있습니다.
