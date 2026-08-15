# Our World in Data MCP 서버

[Our World in Data](https://ourworldindata.org)(OWID)의 공개 API를 MCP 도구로 노출하는 stdio 서버입니다.
**API 키가 필요 없습니다.**

## 설치

```bash
npm install
npm run build
```

## 등록

Claude Code:

```bash
claude mcp add owid -- node /absolute/path/to/MCP/our-worlds-in-data-mcp/dist/index.js
```

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "owid": {
      "command": "node",
      "args": ["/absolute/path/to/MCP/our-worlds-in-data-mcp/dist/index.js"]
    }
  }
}
```

## 도구

| 도구 | 설명 |
| --- | --- |
| `owid_search_charts` | 키워드로 차트 검색 → `slug` 획득 |
| `owid_search_articles` | 아티클·데이터 인사이트·주제 페이지 검색 |
| `owid_search_indicators` | 지표 자연어(시맨틱) 검색 → `indicator_id` 획득 |
| `owid_get_chart_data` | 차트 데이터를 CSV로 (국가/기간 필터, 행 수 제한) |
| `owid_get_chart_metadata` | 차트 제목·인용 문구·컬럼 정의·출처 |
| `owid_get_chart_readme` | 데이터 패키지 README (CSV 구조, 권장 인용) |
| `owid_get_indicator_data` | 지표의 long-format 데이터 (엔티티/연도 필터) |
| `owid_get_indicator_metadata` | 지표 정의·단위·원자료 출처 |

### 일반적인 흐름

1. `owid_search_charts({ query: "life expectancy" })` → `slug: "life-expectancy"`
2. `owid_get_chart_data({ slug: "life-expectancy", countries: ["KOR","JPN"], time: "2000..2020" })`
3. 수치를 해석·인용하기 전에 `owid_get_chart_metadata`로 정의와 출처 확인

차트로 만들어지지 않은 세부 지표는 `owid_search_indicators` → `owid_get_indicator_data` 경로를 씁니다.

### 파라미터 메모

- `countries`: ISO3 코드(`KOR`)와 OWID 엔티티명(`South Korea`, `World`, `Asia`) 모두 허용
- `time`: `2000..2020`, `2020`, `latest`, `earliest..latest`
- `max_rows`: 기본 500행. 초과분은 잘리고 안내 문구가 붙습니다 (`full: true`로 전체 데이터셋 요청 시 주의)

## 사용하는 OWID 엔드포인트

- `https://ourworldindata.org/api/search` — 차트/페이지 검색
- `https://ourworldindata.org/grapher/{slug}.csv|.metadata.json|.readme.md` — 차트 데이터
- `https://search.owid.io/indicators` — 지표 시맨틱 검색
- `https://api.ourworldindata.org/v1/indicators/{id}.data.json|.metadata.json` — 지표 단위 데이터

## 검증

```bash
npm run smoke     # 8개 도구를 실제 API로 호출
npm run inspect   # MCP Inspector로 대화형 확인
```

## 라이선스 / 데이터 이용

서버 코드는 MIT. OWID 데이터는 **CC BY 4.0**이며 결과를 인용할 때 출처를 표기해야 합니다.
일부 데이터셋은 재배포가 제한되어(`nonRedistributable`) 403을 반환하며, 이 경우 원 출처에서 직접 받아야 합니다.
