# dbpia-mcp

[DBpia](https://www.dbpia.co.kr) 논문 검색·상세 조회·원문 PDF 다운로드를 제공하는 MCP 서버.

기관(B2B) 계정으로 로그인해 세션 쿠키를 유지하며, DBpia가 원문을 직접 주지 않는 논문은
[KCI](https://www.kci.go.kr)의 공개 원문으로 대체해 받는다.

공개 API가 없어 웹 엔드포인트를 직접 호출한다. DBpia 쪽 변경에 따라 깨질 수 있다.

## 설치

```bash
npm install
```

빌드 단계가 없다. `index.mjs`를 그대로 실행한다.

## 등록

Claude Code:

```bash
claude mcp add dbpia \
  -e DBPIA_B2B_ID=기관ID \
  -e DBPIA_B2B_ACC=계정 \
  -e DBPIA_B2B_PASS=비밀번호 \
  -- node /absolute/path/to/MCP/dbpia-mcp/index.mjs
```

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "dbpia": {
      "command": "node",
      "args": ["/absolute/path/to/MCP/dbpia-mcp/index.mjs"],
      "env": {
        "DBPIA_B2B_ID": "기관ID",
        "DBPIA_B2B_ACC": "계정",
        "DBPIA_B2B_PASS": "비밀번호"
      }
    }
  }
}
```

기관 ID를 모르면 자격증명 없이 서버를 띄운 뒤 `search_institution`으로 먼저 조회한다.
이 도구만 로그인 없이 동작한다.

## 도구

| 도구 | 설명 |
| --- | --- |
| `search` | 키워드로 논문 검색 (`page`, `pageSize`, `sort`) |
| `get_article` | Node ID로 제목·저자·초록·키워드 등 상세 조회 |
| `search_institution` | 기관명으로 `b2b_id` 조회 — **로그인 불필요** |
| `get_fulltext` | 원문 접근 권한 확인 및 열람 링크 반환 |
| `download_pdf` | 원문 PDF를 로컬 폴더에 저장 |

`sort`는 `RANK`(관련도, 기본) · `DATE`(최신순) · `CITE`(인용순).
`pageSize`는 기본 20, 최대 50.

Node ID는 검색 결과에 `NODE11462877` 형태로 나오며 나머지 도구의 입력이 된다.

### 사용 흐름

```
search_institution { keyword: "○○대학교" }   → b2b_id 확보 (최초 1회)
search             { query: "자연어처리" }    → NODE... 확보
get_article        { nodeId: "NODE..." }      → 초록·서지정보
download_pdf       { nodeId: "NODE..." }      → PDF 저장
```

### download_pdf

`outputDir`로 저장 위치를 지정할 수 있고, 생략하면
`DBPIA_DOWNLOAD_DIR` → 서버 실행 디렉터리의 `downloads/` 순으로 결정된다.

DBpia가 원문을 주지 않으면 KCI의 공개 원문을 찾아 받는다. 이때
서지 제목이 일치하는지 대조하고, `fncDown(...)` 링크가 있는 경우에만 실제 원문으로 취급한다.
KCI가 간헐적으로 `Content-Length`보다 짧은 응답을 끊는 문제가 있어
손상된 PDF를 저장하지 않도록 최대 3회 재시도한다.

## 환경 변수

| 변수 | 필수 | 설명 |
| --- | --- | --- |
| `DBPIA_B2B_ID` | ✅ | 기관 ID (`search_institution`으로 조회) |
| `DBPIA_B2B_ACC` | ✅ | 기관 로그인 계정 |
| `DBPIA_B2B_PASS` | ✅ | 기관 로그인 비밀번호 |
| `DBPIA_B2B_NAME` | | 기관명. 로그인 폼에 함께 전송 |
| `DBPIA_DOWNLOAD_DIR` | | PDF 기본 저장 경로 |

자격증명은 **환경변수로만** 주입한다. 코드나 설정 파일에 적어 커밋하지 말 것.

## 구현 메모

- 로그인은 `POST /member/b2bLoginProc`. 세션 쿠키를 메모리에 들고 다니며,
  마지막 확인 후 5분이 지나면 `/member/me`로 유효성을 재확인한다.
  만료된 쿠키를 계속 쓰면 이후 요청이 조용히 실패하기 때문이다.
- DBpia와 KCI의 세션 쿠키는 분리해서 관리한다. 각 origin에 맞는 쿠키만 실어 보낸다.
- 세션 쿠키는 디스크에 저장하지 않는다. 서버를 재시작하면 다시 로그인한다.

## 주의

다운로드한 PDF는 **DBpia·KCI의 저작물**이다. 소속 기관의 이용 약관이 허용하는 범위에서만
사용하고 재배포하지 말 것. `_dl/`, `downloads/`, `*.pdf`는 `.gitignore`로 커밋에서 제외해 두었다.

## 라이선스

코드 한정 ISC. 논문 원문의 권리는 각 발행처와 DBpia·KCI에 있다.
