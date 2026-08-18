# millie-mcp

밀리의 서재 도서 검색 MCP 서버. 전자책·오디오북 검색, 검색어 자동완성, 사용자 서재·독서
포스트 검색, 도서 메타데이터 상세 조회를 제공한다.

**검색 계열은 인증이 필요 없다.** 밀리 앱이 쓰는 공개 검색 엔드포인트를 그대로 호출한다.
상세 조회(`millie_book_detail`)만 밀리 계정 토큰을 쓴다.

## 설치

```bash
npm install
npm run build
```

## 등록

```bash
claude mcp add millie -- node /absolute/path/to/MCP/millie-mcp/dist/index.js
```

상세 조회까지 쓰려면 토큰을 함께 넘긴다.

```bash
claude mcp add millie \
  -e MILLIE_AUTH_FILE=/path/to/auth.json \
  -- node /absolute/path/to/MCP/millie-mcp/dist/index.js
```

Claude Desktop은 `claude_desktop_config.json`에:

```json
{
  "mcpServers": {
    "millie": {
      "command": "node",
      "args": ["/absolute/path/to/MCP/millie-mcp/dist/index.js"],
      "env": { "MILLIE_AUTH_FILE": "/path/to/auth.json" }
    }
  }
}
```

## 툴

| 툴 | 하는 일 | 인증 |
| --- | --- | --- |
| `millie_search` | 도서 검색. 제목·저자·출판사·ISBN이 모두 키워드로 잡힌다 | 불필요 |
| `millie_autocomplete` | 검색어 자동완성 + 관련 카테고리 | 불필요 |
| `millie_search_sections` | 같은 키워드로 사용자 서재·독서 포스트·밀리로드 검색 | 불필요 |
| `millie_book_detail` | 페이지 수·파일 형식·크기·TTS·대여 가능 여부 | **필요** |
| `millie_auth_status` | 토큰을 어디서 읽었는지, 만료됐는지 (토큰 값은 반환하지 않음) | — |

### 사용 예

```
# 표기가 불확실할 때는 자동완성으로 검색어부터 확정한다
millie_autocomplete keyword:"파이"
  → suggestions: ["파이", "파이 이야기", "파이썬 데이터 분석가 되기 + 챗GPT", ...]

# 지금 바로 볼 수 있는 책만
millie_search keyword:"이태준" count:20 availableOnly:true

# 오디오북만
millie_search keyword:"김영하" audiobookOnly:true

# 다음 페이지 (hasMore 가 true 인 동안)
millie_search keyword:"소설" page:2 count:20

# 사람들이 이 작가를 어떻게 읽었는지
millie_search_sections keyword:"김유정" sections:["post"] limit:10

# 검색 결과의 bookId 또는 상세 페이지 URL 로
millie_book_detail book:"3c966d5d20f8428a"
  → totalPages: 252, format: "pdf", fileSizeMb: 15.3, tts: true
```

`millie_search`와 `millie_book_detail`은 `raw:true`로 밀리 원본 필드를 그대로 받을 수 있다.
정규화 과정에서 빠진 값이 필요할 때 쓴다.

## 환경 변수

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `MILLIE_ACCESS_TOKEN` | — | Bearer 토큰. `Bearer ` 접두사는 있어도 없어도 된다 |
| `MILLIE_SESSION_ID` | — | 세션 ID. 토큰과 함께 보낸다 |
| `MILLIE_AUTH_FILE` | `~/.millie/auth.json` | `access_token`·`session_id`를 담은 JSON 경로 |
| `MILLIE_SHOW_ADULT` | — | `1`이면 성인 콘텐츠를 검색 결과에 포함 |
| `MILLIE_TIMEOUT` | `15000` | 요청 타임아웃 (ms) |
| `MILLIE_USER_AGENT` | `Dart/3.9 (dart:io)` | 앱 UA. 웹 브라우저 UA로 바꾸지 말 것 |
| `MILLIE_LIVE_API_BASE` | `https://live-api.millie.co.kr` | 검색 API |
| `MILLIE_API_BASE` | `https://apis.millie.co.kr` | 콘텐츠 API |
| `MILLIE_WEB_BASE` | `https://www.millie.co.kr` | 도서 링크 생성용 |

환경변수가 `MILLIE_AUTH_FILE`보다 우선한다.

## 실행 확인

```bash
npm run smoke     # 실제 API로 5개 도구 호출
npm run inspect   # MCP Inspector
```

`smoke`는 인증이 없으면 상세 조회만 에러로 표시하고 나머지는 그대로 검증한다.

## 구현 메모

밀리 API의 실제 동작을 확인해 다음을 반영했다.

- **정렬은 없다.** `sortType`·`sort` 같은 파라미터를 붙여도 응답 순서가 바뀌지 않는다.
  항상 밀리의 관련도 순이며, 최신순/인기순이 필요하면 받아서 클라이언트에서 정렬해야 한다.
- **한 번의 호출이 전 섹션을 돌려준다.** `/v3/search/total`은 `searchType` 값과 무관하게
  `content`(도서)·`library`(서재)·`post`(독서 포스트)·`millie_road`·`story`를 한꺼번에
  반환한다. `millie_search_sections`는 추가 요청이 아니라 같은 응답의 다른 가지를 꺼낸다.
- **페이지네이션에 상한이 없다.** `startPage`를 100까지 넘겨도 정상 응답이고,
  `contentlimitCount`는 500까지 확인했다. 도구에서는 100으로 제한한다.
- **오디오북 구분 필드가 따로 없다.** 낭독자(`reader_name`)나 오디오 아이콘 값으로만
  추론된다. `audiobookOnly` 필터는 이 추론에 기댄다.
- **`x-millie-api-version: v2` 헤더가 필요하다.** 없으면 구버전 응답이 온다.
  User-Agent도 앱 것(`Dart/3.9 (dart:io)`)을 그대로 쓴다.
- **상세 조회는 봉투가 없다.** 검색 계열은 `{RESP_CD, RESP_DATA}`로 감싸 오지만
  `/v3/content/summary/book/{id}/`는 평평한 JSON을 돌려준다. 에러만 `errors` 키로 온다.
- **토큰 만료 시각은 참고용이다.** `access_token_expires_at`이 지난 토큰도 밀리가 한동안
  받아준다. 그래서 만료를 이유로 요청을 미리 끊지 않고, 인증 실패했을 때만 원인으로 덧붙인다.
- **토큰 갱신은 하지 않는다.** refresh 흐름은 PKCE 로그인까지 필요해서 이 서버 범위를
  벗어난다. 만료되면 발급해 준 쪽에서 다시 넣어야 한다.

비공식 내부 API라 밀리 쪽 변경에 따라 깨질 수 있다.

## 범위

읽기 전용이다. 검색과 메타데이터 조회만 하고, 대여·다운로드·서재 조작은 하지 않는다.
도서 본문은 DRM(NCG)으로 보호되며 이 서버는 그 영역을 건드리지 않는다.
