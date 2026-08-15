# bunjang-mcp

번개장터(Bunjang) 상품 검색·상세 조회·판매자 상품 목록·카테고리 탐색·중고 시세 통계를 제공하는 MCP 서버.

번개장터 웹이 사용하는 공개 JSON API를 그대로 호출하며, 로그인·브라우저 자동화 없이 동작한다.

## 설치

```bash
npm install
npm run build
```

## 등록

Claude Code:

```bash
claude mcp add bunjang -- node /absolute/path/to/MCP/bunjang-mcp/dist/index.js
```

또는 `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "bunjang": {
      "command": "node",
      "args": ["/absolute/path/to/MCP/bunjang-mcp/dist/index.js"]
    }
  }
}
```

## 툴

| 툴 | 설명 |
| --- | --- |
| `bunjang_search` | 키워드·카테고리·판매자·가격대·상품상태로 상품 검색 |
| `bunjang_product_detail` | 상품 ID/URL 로 본문·거래방식·조회수·판매자 평점까지 상세 조회 |
| `bunjang_seller_products` | 특정 판매자(상점)의 상품 목록 |
| `bunjang_price_stats` | 검색 표본 기반 중고 시세 요약 (중앙값·사분위 범위·최저가 매물) |
| `bunjang_categories` | 카테고리 트리 검색/탐색 (여기서 얻은 id 를 검색에 사용) |

### 공통 필터

- `condition`: `any` | `used`(중고) | `new`(새상품/미개봉)
- `minPrice` / `maxPrice`: 원 단위
- `onSaleOnly`: 예약중·판매완료 제외
- `includeAds`: 광고 상품 포함 (기본 제외)
- `freeShippingOnly`: 무료배송만

### 사용 예

```
"번개장터에서 맥북에어 M2 중고 시세 알려줘"
  → bunjang_price_stats { keyword: "맥북에어 m2", condition: "used" }

"100만원 이하 맥북에어 M2 매물 10개 보여줘"
  → bunjang_search { keyword: "맥북에어 m2", maxPrice: 1000000, condition: "used",
                     sort: "price_asc", limit: 10, onSaleOnly: true }

"이 판매자가 파는 다른 물건은?"
  → bunjang_product_detail → seller.sellerId → bunjang_seller_products
```

## 환경 변수

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `BUNJANG_API_BASE` | `https://api.bunjang.co.kr` | API 베이스 |
| `BUNJANG_WEB_BASE` | `https://m.bunjang.co.kr` | 결과 링크 생성용 웹 베이스 |
| `BUNJANG_TIMEOUT` | `15000` | 요청 타임아웃 (ms) |
| `BUNJANG_CATEGORY_TTL` | `21600000` | 카테고리 트리 캐시 시간 (ms, 기본 6시간) |
| `BUNJANG_USER_AGENT` | Chrome UA | 요청 User-Agent |

## 구현 메모

번개장터 API의 실제 동작을 확인해 다음을 클라이언트에서 보정한다.

- **중고 필터**: `f_used=1`(중고)은 서버에서 항상 0건을 반환한다. 새상품(`f_used=2`)만 서버 필터를 쓰고, 중고는 전체를 받아 응답의 `used` 값으로 거른다.
- **무료배송·판매상태 필터**: API가 지원하지 않아 받아온 뒤 걸러낸다. 필터로 탈락하는 양을 감안해 최대 6페이지까지 페이징한다.
- **구매 희망 글 제외**: "최고가 매입합니다" 류 글이 판매 글에 섞여 시세를 크게 왜곡하므로 `bunjang_price_stats`는 기본적으로 제외한다 (`includeWantedAds: true` 로 포함 가능). 제외한 건수는 `excludedWantedAds` 로 보고한다.
- **판매자 상품 목록**: `f_uid` 는 `req_ref=shop` 과 함께 보내야 동작한다. 상점 목록에서는 자기 상품에도 광고 플래그가 붙어 `includeAds` 를 켠 상태로 조회한다.

비공식 내부 API라 번개장터 쪽 변경에 따라 깨질 수 있다.
