# MCP Servers

직접 만들거나 사용 중인 [MCP](https://modelcontextprotocol.io) 서버 모음.
각 디렉터리가 완전히 독립된 서버다. 공유 워크스페이스나 루트 빌드가 없고,
의존성·빌드·버전을 프로젝트마다 따로 관리한다.

전부 **stdio 트랜스포트**로 동작하며 Claude Code / Claude Desktop 등 MCP 클라이언트에
개별 등록해서 쓴다.

## 서버 목록

| 프로젝트 | 하는 일 | 도구 | 인증 | 스택 |
| --- | --- | ---: | --- | --- |
| [`aliexpress-mcp`](aliexpress-mcp/) | AliExpress 상품 검색·상세 조회 | 5 | 선택 | TS + Playwright |
| [`bunjang-mcp`](bunjang-mcp/) | 번개장터 검색·중고 시세·판매자 목록 | 5 | 불필요 | TS |
| [`choson-sillok-mcp`](choson-sillok-mcp/) | 조선왕조실록 전문 검색·기사 열람 | 5 | 불필요 | TS + cheerio |
| [`dbpia-mcp`](dbpia-mcp/) | DBpia 논문 검색·원문 PDF 다운로드 | 5 | **필수** | JS (빌드 없음) |
| [`easyeda-mcp-pro`](easyeda-mcp-pro/) | EasyEDA Pro PCB 설계·BOM·제조 파일 | 120+ | 불필요 | TS + pnpm |
| [`mc-mcp`](mc-mcp/) | 실제 Minecraft 26.2 클라이언트 조작 | 44 | 불필요 | TS + Fabric 모드(Java 25) |
| [`millie-mcp`](millie-mcp/) | 밀리의 서재 도서 검색·자동완성·상세 | 5 | 선택 | TS |
| [`notion-mcp`](notion-mcp/) | Notion 페이지·블록·데이터베이스·댓글 CRUD | 25 | **필수** | TS |
| [`our-worlds-in-data-mcp`](our-worlds-in-data-mcp/) | Our World in Data 차트·지표 조회 | 8 | 불필요 | TS |

설치·등록·도구별 상세 인자는 각 디렉터리의 `README.md`에 있다.

## 도구 한눈에 보기

<details>
<summary><b>aliexpress-mcp</b> — 브라우저 세션 기반 (5)</summary>

`aliexpress_login` `aliexpress_auth_status` `aliexpress_logout`
`aliexpress_search` `aliexpress_product_detail`

일반 HTTP는 물론 기본 headless 브라우저까지 캡차로 막히기 때문에, stealth 지문 위장으로
1차 대응하고 그래도 막히면 실제 브라우저 창을 띄워 사람이 통과시킨 세션을 재사용한다.
</details>

<details>
<summary><b>bunjang-mcp</b> — 공개 JSON API (5)</summary>

`bunjang_search` `bunjang_product_detail` `bunjang_seller_products`
`bunjang_price_stats` `bunjang_categories`

로그인·브라우저 없이 동작. 중고 필터와 무료배송 필터는 서버가 제대로 처리하지 않아
클라이언트에서 보정한다. 시세 통계는 "최고가 매입합니다" 류 구매 희망 글을 기본 제외한다.
</details>

<details>
<summary><b>choson-sillok-mcp</b> — HTML 파싱 (5)</summary>

`search_sillok` `get_sillok_article` `list_sillok_kings`
`list_sillok_months` `list_sillok_day`

공개 API가 없어 웹 페이지를 파싱한다. 국역문·한문 원문 양쪽 검색과 왕대→연월→일자
단위 탐색을 지원한다.
</details>

<details>
<summary><b>dbpia-mcp</b> — 기관 계정 필요 (5)</summary>

`search` `get_article` `search_institution` `get_fulltext` `download_pdf`

`search_institution`만 로그인 없이 동작한다. 기관 ID를 모를 때 이걸로 먼저 찾는다.
DBpia가 원문을 주지 않는 논문은 KCI의 공개 원문으로 대체해 받는다.
</details>

<details>
<summary><b>millie-mcp</b> — 검색은 무인증, 상세만 토큰 (5)</summary>

`millie_search` `millie_autocomplete` `millie_search_sections`
`millie_book_detail` `millie_auth_status`

밀리 앱이 쓰는 검색 엔드포인트를 그대로 부른다. 한 번의 호출이 도서·서재·독서 포스트·
밀리로드를 한꺼번에 돌려주므로 섹션 검색은 추가 요청이 아니다. 정렬 파라미터는 없고
항상 관련도 순이다. 상세 조회만 계정 토큰을 쓴다.
</details>

<details>
<summary><b>our-worlds-in-data-mcp</b> — 공개 API, 키 불필요 (8)</summary>

`owid_search_charts` `owid_search_articles` `owid_search_indicators`
`owid_get_chart_data` `owid_get_chart_metadata` `owid_get_chart_readme`
`owid_get_indicator_data` `owid_get_indicator_metadata`

차트 검색 → `slug` → 데이터 조회가 기본 흐름. 차트로 만들어지지 않은 세부 지표는
지표 시맨틱 검색 경로를 쓴다.
</details>

<details>
<summary><b>mc-mcp</b> — 실제 게임 클라이언트 조작 (44)</summary>

- **세션** `mc_launch` `mc_quit` `mc_connect` `mc_disconnect` `mc_session` `mc_state` `mc_worlds` `mc_open_world`
- **이동** `mc_move` `mc_look` `mc_goto` `mc_stop` `mc_paths` `mc_baritone`
- **블록** `mc_break_block` `mc_use_block` `mc_get_block` `mc_scan_blocks` `mc_pick_block` `mc_worldedit`
- **엔티티·아이템** `mc_attack_entity` `mc_interact_entity` `mc_entities` `mc_use_item` `mc_inventory` `mc_open_inventory`
- **화면** `mc_screenshot` `mc_screen` `mc_screen_click` `mc_screen_input` `mc_input_lock`
- **서버·명령** `mc_chat` `mc_command` `mc_command_syntax` `mc_registry` `mc_raw`
- **콘텐츠** `mc_datapack_create` `mc_datapack_write` `mc_datapack_files` `mc_datapack_reload` `mc_datapack_delete` `mc_mods` `mc_resourcepack` `mc_resourcepacks`

프로토콜 봇이 아니라 **진짜 클라이언트**를 띄운다. Baritone·WorldEdit이 클라이언트 모드이고,
스크린샷은 실제 렌더링이 필요하며, `mineflayer`가 26.2 프로토콜을 지원하지 않기 때문이다.
이동은 실제 `KeyMapping` 입력으로 처리해 서버 입장에서 텔레포트하는 스크립트가 아닌 플레이어로 보인다.
</details>

<details>
<summary><b>easyeda-mcp-pro</b> — 회로도/PCB 전 영역 (120+)</summary>

`easyeda_schematic_*`(배치·배선·네트·ERC), `easyeda_pcb_*`(부품·트랙·비아·존·DRC),
`easyeda_bom_*`(생성·검증·소싱·견적), `easyeda_export_*`(Gerber·netlist·PDF·pick&place),
`easyeda_workflow_*`(디커플링·전원 레일·커넥터 브레이크아웃 등 조합 작업).

전체 목록은 [`easyeda-mcp-pro/docs/reference/tools.md`](easyeda-mcp-pro/docs/reference/tools.md) 참고.
</details>

## 설치

Node.js 20+ 기준. 대부분 다음이면 된다.

```bash
cd <프로젝트>
npm install
npm run build
```

예외가 셋 있다.

| 프로젝트 | 설치 |
| --- | --- |
| `dbpia-mcp` | `npm install` 만. 빌드 단계 없이 `index.mjs`를 직접 실행 |
| `easyeda-mcp-pro` | pnpm 사용 — `pnpm install && pnpm build` |
| `mc-mcp` | `scripts/setup.sh` — 브리지 모드·Baritone·WorldEdit·서버까지 빌드. **Java 25 필요** |

`aliexpress-mcp`은 `postinstall`에서 Playwright Chromium을 자동으로 받는다(수백 MB).

## MCP 클라이언트 등록

각 README의 `/absolute/path/to/MCP/`는 **이 저장소를 클론한 실제 경로**로 바꿔야 한다.
`~/repos/MCP`에 클론했다면:

```bash
claude mcp add bunjang -- node ~/repos/MCP/bunjang-mcp/dist/index.js
claude mcp add owid    -- node ~/repos/MCP/our-worlds-in-data-mcp/dist/index.js
```

자격증명이 필요한 서버는 `-e`로 환경변수를 함께 넘긴다.

```bash
claude mcp add dbpia \
  -e DBPIA_B2B_ID=기관ID -e DBPIA_B2B_ACC=계정 -e DBPIA_B2B_PASS=비밀번호 \
  -- node ~/repos/MCP/dbpia-mcp/index.mjs
```

Claude Desktop은 `claude_desktop_config.json`의 `mcpServers`에 같은 내용을 JSON으로 넣는다.
형식은 각 README에 있다.

## 개발

**공통 스택.** `@modelcontextprotocol/sdk` + `zod`(입력 스키마) + `StdioServerTransport`.
TypeScript 프로젝트는 `src/index.ts`에서 `server.registerTool(...)`로 도구를 등록하고
`tsc`로 `dist/`에 빌드한다.

**디버깅.** stdio 서버는 **stdout에 로그를 쓰면 프로토콜이 깨진다.** 디버그 출력은 반드시
stderr로 보낼 것. 대화형 확인은 MCP Inspector가 편하다.

```bash
npx -y @modelcontextprotocol/inspector node dist/index.js
```

`our-worlds-in-data-mcp`와 `millie-mcp`는 `npm run inspect`(Inspector)와 `npm run smoke`(실제 API로
전체 도구 호출)를 스크립트로 제공한다.

**스크래핑 서버의 수명.** `aliexpress` · `bunjang` · `choson-sillok` · `dbpia` · `millie`는 공식 API가 아니라
웹 엔드포인트를 직접 호출한다. 대상 사이트가 바뀌면 깨진다. 각 README의 "구현 메모"에
재현하기 까다로웠던 지점(필수 hidden 필드, 쿠키로 전달되는 파라미터, 서버 필터 버그 등)을
정리해 뒀으니 고치기 전에 먼저 읽을 것.

## 저장소 규칙

**`.gitignore`는 2계층이다.**

- 루트 `.gitignore` — 모든 프로젝트 공통. 빌드 산출물(`dist/` `build/` `node_modules/`
  `coverage/` `*.jar`), OS 파일, 로그, 시크릿(`.env` `*.pem` `*.key`)
- 프로젝트별 `.gitignore` — 그 프로젝트에만 해당하는 규칙만

새 규칙은 공통이면 루트에, 특정 프로젝트에만 해당하면 그 프로젝트에 넣는다.
`gradle-wrapper.jar`는 `*.jar` 규칙의 예외로 커밋된다(빌드에 필요).

**커밋하면 안 되는 것.**

- 자격증명. 전부 환경변수로 주입한다 — 코드나 설정 파일에 적지 말 것
- 스크래핑·다운로드로 받은 저작권 자료 (`dbpia-mcp/_dl/` `downloads/` `*.pdf`는 무시 설정됨)
- 로그인 세션 파일 (`~/.claude/mcp/aliexpress/`의 프로필·`state.json`은 자격증명에 준한다)
- vendored 소스와 빌드 바이너리 (`mc-mcp/baritone/` `test-server/`는 `setup.sh`가 받아온다)

## 라이선스

프로젝트마다 다르다.

| 라이선스 | 프로젝트 |
| --- | --- |
| MIT | `choson-sillok-mcp` · `our-worlds-in-data-mcp` · `easyeda-mcp-pro` |
| ISC | `dbpia-mcp` · `notion-mcp` |
| 미지정 | `aliexpress-mcp` · `bunjang-mcp` · `mc-mcp` · `millie-mcp` |

`easyeda-mcp-pro`는 [oaslananka/easyeda-mcp-pro](https://github.com/oaslananka/easyeda-mcp-pro)의
사본이다(MIT, `LICENSE` 포함). 해당 README의 CI·Scorecard 배지는 이 저장소가 아니라 upstream을 가리킨다.

**코드 라이선스가 데이터 이용까지 허용하지는 않는다.** 조선왕조실록 원문·번역문의 권리는
국사편찬위원회에, OWID 데이터는 CC BY 4.0(출처 표기 필요, 일부는 재배포 제한), DBpia·KCI 논문은
각 발행처에 있다. 상거래 사이트와 밀리의 서재 데이터는 각 사이트의 이용약관을 따른다.
