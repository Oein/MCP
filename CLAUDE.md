# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 저장소 성격

MCP 서버 모음이다. **각 최상위 디렉터리가 완전히 독립된 프로젝트**이며, 루트에는
워크스페이스도 빌드 스크립트도 package.json도 없다. 의존성·빌드·버전·라이선스를
프로젝트마다 따로 관리한다. 작업 전에 반드시 해당 프로젝트 디렉터리로 이동할 것.

전부 **stdio 트랜스포트**로 동작한다.

## 빌드·실행

대부분의 프로젝트(`aliexpress-mcp` `bunjang-mcp` `choson-sillok-mcp` `millie-mcp`
`our-worlds-in-data-mcp`):

```bash
cd <프로젝트> && npm install && npm run build   # tsc → dist/
npm run dev                                     # tsc --watch (choson-sillok에는 없음)
node dist/index.js                              # = npm start
```

예외 셋:

| 프로젝트 | 빌드 | 테스트 |
| --- | --- | --- |
| `dbpia-mcp` | 빌드 없음. `index.mjs` 단일 파일 직접 실행 | 없음 |
| `easyeda-mcp-pro` | **pnpm 전용** — `pnpm install && pnpm build` | `pnpm test` (vitest) |
| `mc-mcp` | `scripts/setup.sh` (Java 25 필요) 후 `npm run build` | `npm run e2e` |

### 테스트

- **easyeda-mcp-pro** — vitest. 단일 파일은 `pnpm vitest run tests/unit/<파일>.test.ts`,
  단일 테스트는 `-t "<이름>"`. 전체 게이트는 `pnpm verify`(format·typecheck·lint·복잡도
  래칫·툴 커버리지·테스트·패키징·시크릿 검사·문서 빌드까지 한 번에) — 무겁지만 커밋 전
  기준이다. 개별로는 `pnpm typecheck` `pnpm lint` `pnpm format:check`.
- **mc-mcp** — `node --test` 기반 e2e. **실제 Minecraft 클라이언트를 띄우는 통합
  테스트뿐**이며 유닛 테스트는 없다. 터미널 1에서 `scripts/test-server.sh`,
  터미널 2에서 `npm run e2e`. 싱글플레이 세이브로 돌리면 서버가 필요 없다:
  `MCMCP_WORLD=<세이브명> npm run e2e`. 창을 보려면 `npm run e2e:visible`.
  단일 테스트는 `cd e2e && node --test tests/<파일>.test.ts`(사전에 루트 `npm run build`).
- **나머지** — 자동화 테스트가 없다. `our-worlds-in-data-mcp`와 `millie-mcp`의
  `npm run smoke`(실제 API로 전 도구 호출)가 유일한 실행 확인 수단이다. 스모크
  스크립트는 `StdioClientTransport`에 `env`를 명시해야 서버까지 환경변수가 전달된다.

### 디버깅

stdio 서버는 **stdout에 로그를 쓰면 프로토콜이 깨진다.** 디버그 출력은 반드시 stderr로.

```bash
npx -y @modelcontextprotocol/inspector node dist/index.js
# our-worlds-in-data-mcp·millie-mcp: npm run inspect / easyeda-mcp-pro: pnpm inspector
```

## 구조

### 공통 패턴 (mc-mcp·easyeda 제외 전부)

`@modelcontextprotocol/sdk` + `zod` + `StdioServerTransport`. `src/index.ts`가 얇은
어댑터 층이다 — `new McpServer(...)` → `server.registerTool()`로 zod 스키마와 함께
도구를 등록하고, 로컬 `ok()`/`fail()` 헬퍼로 결과를 `content: [{type:"text", text: JSON}]`
형태로 감싼다. 실제 로직은 도메인 모듈(`bunjang.ts` `sillok.ts` `api.ts` `aliexpress.ts`)에
있고, 튜닝 가능한 값(엔드포인트·타임아웃·User-Agent)은 `config.ts`에서 환경변수로 덮어쓴다.
**도구를 추가할 때 로직을 `index.ts`에 넣지 말 것.**

### mc-mcp — 3계층

```
MCP 서버(TS)  ──stdio──▶  @mc-mcp/client(TS)  ──HTTP/127.0.0.1──▶  Fabric 브리지 모드(Java 25)
                                                                   + Baritone + WorldEdit
```

- `mcp-server/` — 도구 정의만. `packages/client/`의 타입드 클라이언트를 호출한다.
- `packages/client/` — 브리지 HTTP 프로토콜, 게임 런처, 대기/폴링 유틸. 에이전트 없이
  스크립트로 게임을 조작할 때 쓰는 공개 API이기도 하다.
- `bridge-mod/` — Gradle/Java. `actions/*.java`가 실제 동작이고 `mixin/*.java`가 바닐라
  동작을 덮어쓴다(입력 잠금, headless 창, IME 가드, 채팅 캡처).

새 기능은 대개 **세 곳 모두**를 건드린다: `actions/`에 브리지 액션 → `client/`에 메서드 →
`mcp-server/`에 도구. Minecraft 26.2는 난독화되지 않아 Mojang 이름으로 직접 컴파일한다
(Yarn/Intermediary 매핑 없음). 이동은 `KeyMapping` 실제 입력으로 처리한다 — 텔레포트
방식으로 바꾸지 말 것, 설계 의도다.

안전 장치 세 가지(수정 시 주의): 브리지는 `127.0.0.1` 바인딩 + `~/.mcmcp/bridge.json`의
설치별 베어러 토큰, `mc_connect`는 loopback/RFC1918 주소만 허용, 오프라인 계정만 허용.

### easyeda-mcp-pro — vendored 사본

[oaslananka/easyeda-mcp-pro](https://github.com/oaslananka/easyeda-mcp-pro)의 사본이다.
**기능 변경은 upstream으로 보낼 것.** 이 저장소의 커밋은 모노레포 적응(README 고지,
`.gitignore` 정리)에 한정한다. README의 CI·Scorecard 배지는 upstream을 가리킨다.

도구는 `src/tools/`에서 레벨별로 나뉜다 — `L0_*`(진단) `L1_*`(원자적 읽기/쓰기)
`L2_*`(오토라우팅·시뮬레이션·조합 워크플로). `registry.ts`/`register.ts`가 등록을
담당하고, EasyEDA Pro 자체와는 브라우저 확장(`easyeda-bridge-extension/`)으로 통신한다.

## 스크래핑 서버의 취급

`aliexpress` `bunjang` `choson-sillok` `dbpia` `millie`는 공식 API가 아니라 웹 엔드포인트를
직접 호출한다. 대상 사이트가 바뀌면 깨진다. **고치기 전에 각 README의 "구현 메모"를
먼저 읽을 것** — 필수 hidden 필드, 쿠키로 전달되는 파라미터, 서버 측 필터 버그를
클라이언트에서 보정하는 지점 등, 재현이 까다로웠던 내용이 정리돼 있다. 그 보정 코드가
불필요해 보인다고 지우면 대개 회귀한다.

## 자격증명·환경변수

전부 환경변수로 주입한다. 코드나 설정 파일에 적지 말 것.

- `dbpia-mcp` — `DBPIA_B2B_ID` `DBPIA_B2B_ACC` `DBPIA_B2B_PASS` (`search_institution`만
  로그인 없이 동작), `DBPIA_DOWNLOAD_DIR`
- `aliexpress-mcp` — 자격증명 대신 로그인 세션을 `ALIEXPRESS_MCP_HOME`
  (기본 `~/.claude/mcp/aliexpress/`)에 저장한다. **이 디렉터리는 자격증명에 준한다.**
- `millie-mcp` — `MILLIE_ACCESS_TOKEN`(+`MILLIE_SESSION_ID`) 또는 `MILLIE_AUTH_FILE`
  (기본 `~/.millie/auth.json`). 상세 조회 도구에만 필요하고 검색은 무인증으로 동작한다.
- 나머지는 엔드포인트·타임아웃 튜닝용 선택 변수뿐이다(각 `config.ts` 참고).

## 저장소 규칙

- **`.gitignore`는 2계층.** 공통 규칙(빌드 산출물·`node_modules`·OS 파일·시크릿)은
  루트에, 프로젝트 고유 규칙만 그 프로젝트에. `gradle-wrapper.jar`는 `*.jar`의 예외로 커밋된다.
- **커밋 금지** — 자격증명, 스크래핑·다운로드로 받은 저작권 자료(`dbpia-mcp/_dl/`
  `downloads/` `*.pdf`), 로그인 세션 파일, vendored 소스와 빌드 바이너리
  (`mc-mcp/baritone/` `test-server/`는 `setup.sh`가 받아온다).
- **작업 단위마다 커밋한다.** 한 작업(기능·수정·정리)이 끝나면 그때그때 커밋하고,
  여러 작업을 한 커밋에 몰아넣지 않는다. 프로젝트가 서로 독립적이므로 커밋도
  가급적 프로젝트 하나 범위로 끊는다.
- 커밋 메시지는 한국어, Conventional Commits 형식(`feat(mc-mcp): ...`). 스코프는
  프로젝트 디렉터리 이름을 쓴다. 본문에 "무엇을"보다 "왜"를 적는 것이 이 저장소의 관행이다.
- 라이선스가 프로젝트마다 다르다(MIT / ISC / 미지정). 그리고 **코드 라이선스가 데이터
  이용까지 허용하지는 않는다** — 실록 원문·OWID 데이터·논문은 각기 다른 권리자가 있다.

## rhwp-mcp

아직 git에 올라가지 않은 작업 중 디렉터리다. 현재는 서드파티 [rhwp](https://github.com/edwardkim/rhwp)
(Rust/WASM HWP·HWPX 뷰어) 릴리스 바이너리를 받아둔 상태이고, MCP 서버 코드는 없다.
