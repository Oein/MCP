# aliexpress-mcp

AliExpress 상품 검색과 상세 조회를 제공하는 MCP 서버. 브라우저 창을 띄워 사용자가 직접 로그인하면, 그 세션(쿠키)을 저장해 이후 모든 조회에 재사용한다.

## 왜 브라우저 세션인가

AliExpress 는 일반 HTTP 요청은 물론 기본 headless 브라우저까지 봇 인증(캡차) 페이지로 돌려보낸다. 이 서버는 두 가지로 대응한다.

1. **stealth 지문 위장** — `playwright-extra` + `puppeteer-extra-plugin-stealth` 로 headless 흔적을 지운다. 평상시에는 이것만으로 캡차 없이 조회된다.
2. **사람이 통과시킨 세션 재사용** — 그래도 막히거나 로그인이 필요하면 `aliexpress_login` 이 실제 브라우저 창을 띄운다. 사용자가 로그인·캡차를 직접 처리하면 그 쿠키가 저장되어 이후 요청에 자동으로 실린다.

상품 데이터는 페이지가 내부적으로 호출하는 서명된 mtop API(`mtop.aliexpress.pdp.pc.query`) 응답을 가로채서 얻는다. 서명을 직접 재현하지 않으므로 서명 방식이 바뀌어도 깨지지 않는다.

## 설치

```bash
npm install     # playwright chromium 까지 자동 설치된다
npm run build
```

## MCP 등록

Claude Code:

```bash
claude mcp add aliexpress -- node /absolute/path/to/MCP/aliexpress-mcp/dist/index.js
```

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "aliexpress": {
      "command": "node",
      "args": ["/absolute/path/to/MCP/aliexpress-mcp/dist/index.js"]
    }
  }
}
```

## 툴

| 툴 | 설명 |
| --- | --- |
| `aliexpress_login` | 브라우저 창을 띄워 사용자가 로그인. 확인되면 세션 저장 |
| `aliexpress_auth_status` | 현재 세션이 실제 로그인 상태인지 확인하고 갱신 |
| `aliexpress_logout` | 저장된 세션·프로필 삭제 |
| `aliexpress_search` | 키워드 검색 (`page`, `sort`, `minPrice`, `maxPrice`, `limit`) |
| `aliexpress_product_detail` | 상품 ID 또는 URL 로 상세 조회 (`withReviews`, `reviewLimit`) |

`sort` 는 `best_match` | `orders` | `newest` | `price_asc` | `price_desc`.

### 로그인 동작

`aliexpress_login` 은 기본 120초까지 로그인 완료를 기다린다. 그 안에 끝나면 `loggedIn: true` 로 즉시 반환하고, 넘어가면 창을 열어 둔 채 `pending: true` 로 반환한다. 창에서 로그인을 마친 뒤 `aliexpress_auth_status` 를 호출하면 세션이 저장된다 (백그라운드 감시도 계속 돌아 자동 저장된다).

로그인은 검색·상세 조회의 **필수 조건이 아니다**. 로그인하면 캡차를 덜 만나고 계정 기준 가격·배송 정보가 반영된다.

### 상세 조회 결과

`price`(할인 전후·할인율), `skuOptions`/`skus`(옵션 조합별 가격·재고), `images`, `specs`, `store`(평점·개설일·국가), `rating`/`reviewCount`, `shipping`(발송지·예상 도착일·추적 여부), 선택적으로 `reviews`.

## 세션 저장 위치

- 프로필(기본 저장소): `~/.claude/mcp/aliexpress/profile`
- 쿠키 내보내기: `~/.claude/mcp/aliexpress/state.json`

`ALIEXPRESS_MCP_HOME` 으로 위치를 바꿀 수 있다. 이 파일들은 **로그인 자격에 준하는 정보**이므로 공유하거나 커밋하지 말 것.

## 환경 변수

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `ALIEXPRESS_BASE_URL` | `https://ko.aliexpress.com` | 지역 도메인. 가격 통화가 여기에 따른다 |
| `ALIEXPRESS_MCP_HOME` | `~/.claude/mcp/aliexpress` | 프로필·세션 저장 경로 |
| `ALIEXPRESS_LOCALE` | `ko-KR` | 브라우저 로케일 |
| `ALIEXPRESS_TIMEZONE` | `Asia/Seoul` | 타임존 |
| `ALIEXPRESS_NAV_TIMEOUT` | `45000` | 페이지 로딩 타임아웃(ms) |
| `ALIEXPRESS_LOGIN_TIMEOUT` | `300000` | 백그라운드 로그인 감시 시간(ms) |
| `ALIEXPRESS_IDLE_SHUTDOWN` | `180000` | 유휴 브라우저 자동 종료(ms) |
| `ALIEXPRESS_HEADLESS` | `true` | `false` 면 조회도 창을 띄운다 (디버깅용) |

## 알아둘 점

- 브라우저는 요청 시 뜨고 3분간 유휴하면 자동으로 닫힌다. 조회와 로그인이 같은 프로필을 공유하므로 동시에 두 개가 뜨지 않는다.
- 검색 결과에 나와도 상세 조회 시 국가 제한(`해당 상품은 본 국가에 적용되지 않습니다`)으로 막히는 상품이 있다. 이 경우 명시적인 에러로 반환된다.
- 캡차에 막히면 에러 메시지가 `aliexpress_login` 실행을 안내한다.
- AliExpress 의 페이지 구조가 바뀌면 파서 수정이 필요하다. 파싱 지점은 `src/parse.ts` 한 곳에 모여 있다.
