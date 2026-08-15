import { apiGet } from "./api.js";
import { CATEGORY_TTL, WEB_BASE } from "./config.js";
import type {
  CategoryNode,
  ProductSummary,
  RawFindResponse,
  RawListItem,
} from "./types.js";

/** find_v2 의 order 값. 사용자에게는 알기 쉬운 이름으로 노출한다. */
export const SORT_MAP = {
  score: "score",
  date: "date",
  price_asc: "price_asc",
  price_desc: "price_desc",
} as const;
export type SortKey = keyof typeof SORT_MAP;

/**
 * 상품 상태 필터.
 * API 의 f_used 는 새상품(2)에만 제대로 동작하고 중고(1)로는 0건이 나오므로,
 * 중고는 서버 필터 없이 받아 온 뒤 클라이언트에서 거른다.
 */
export const CONDITION_MAP = {
  any: undefined,
  used: undefined,
  new: 2,
} as const;
export type ConditionKey = keyof typeof CONDITION_MAP;

/** find_v2 응답의 status 코드 → 사람이 읽는 판매 상태. */
const STATUS_LABEL: Record<string, string> = {
  "0": "판매중",
  "1": "예약중",
  "2": "예약중",
  "3": "판매완료",
};

/** 한 번의 API 호출로 받을 수 있는 최대 개수. */
const PAGE_SIZE = 100;

function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? `unknown(${status})`;
}

function conditionLabel(used: number): string {
  if (used === 1) return "중고";
  if (used === 2) return "새상품";
  return "unknown";
}

/** "..._{cnt}_..._w{res}.jpg" 형태의 템플릿을 실제 URL 로 바꾼다. */
export function resolveImageUrl(template: string, index = 1, res = 400): string {
  if (!template) return "";
  return template.replace("{cnt}", String(index)).replace("{res}", String(res));
}

export function productUrl(pid: string | number): string {
  return `${WEB_BASE}/products/${pid}`;
}

export function shopUrl(uid: string | number): string {
  return `${WEB_BASE}/shops/${uid}`;
}

function normalizeItem(item: RawListItem): ProductSummary {
  return {
    productId: String(item.pid),
    name: item.name,
    price: Number(item.price),
    saleStatus: statusLabel(item.status),
    condition: conditionLabel(item.used),
    location: item.location ?? "",
    freeShipping: Boolean(item.free_shipping),
    safePayment: Boolean(item.checkout),
    favoriteCount: Number(item.num_faved ?? 0),
    commentCount: Number(item.num_comment ?? 0),
    updatedAt: new Date(item.update_time * 1000).toISOString(),
    categoryId: String(item.category_id ?? ""),
    sellerId: String(item.uid),
    proshop: Boolean(item.proshop),
    ad: Boolean(item.ad),
    imageUrl: resolveImageUrl(item.product_image),
    url: productUrl(item.pid),
  };
}

export interface SearchOptions {
  keyword?: string;
  categoryId?: string;
  sellerId?: string;
  sort?: SortKey;
  condition?: ConditionKey;
  minPrice?: number;
  maxPrice?: number;
  limit?: number;
  /** 예약중·판매완료를 빼고 바로 살 수 있는 상품만 (기본 false) */
  onSaleOnly?: boolean;
  /** 광고 상품 포함 여부 (기본 false) */
  includeAds?: boolean;
  /** 무료배송 상품만 (API 미지원이라 클라이언트에서 거른다) */
  freeShippingOnly?: boolean;
}

export interface SearchResult {
  query: {
    keyword?: string;
    categoryId?: string;
    sellerId?: string;
    sort: SortKey;
    condition: ConditionKey;
    minPrice?: number;
    maxPrice?: number;
  };
  /** 필터 적용 전, 번개장터가 보고한 전체 검색 결과 수 */
  totalFound: number;
  /** 필터를 통과해 실제 반환된 개수 */
  returned: number;
  products: ProductSummary[];
}

/**
 * find_v2 를 필요한 만큼 페이징하며 호출한다.
 * 판매완료/광고 제외는 API 가 지원하지 않아 받아온 뒤 걸러내므로,
 * limit 을 채우기 위해 여유 있게 여러 페이지를 읽는다.
 */
async function collect(
  opts: SearchOptions,
  reqRef: "search" | "category" | "shop",
): Promise<{ items: ProductSummary[]; totalFound: number }> {
  const limit = opts.limit ?? 20;
  const wanted = Math.min(limit, 300);
  const collected: ProductSummary[] = [];
  const seen = new Set<string>();
  let totalFound = 0;

  // 필터로 상당수가 탈락할 수 있으므로 최대 6페이지까지만 훑는다.
  for (let page = 0; page < 6 && collected.length < wanted; page++) {
    const res = await apiGet<RawFindResponse>("/api/1/find_v2.json", {
      q: opts.keyword,
      f_category_id: opts.categoryId,
      f_uid: opts.sellerId,
      f_price_min: opts.minPrice,
      f_price_max: opts.maxPrice,
      f_used: opts.condition ? CONDITION_MAP[opts.condition] : undefined,
      order: SORT_MAP[opts.sort ?? "score"],
      page,
      n: PAGE_SIZE,
      req_ref: reqRef,
      stat_device: "w",
      stat_category_required: 1,
      version: 4,
    });

    const list = res.list ?? [];
    if (page === 0) totalFound = res.num_found ?? list.length;
    if (list.length === 0) break;

    for (const raw of list) {
      const item = normalizeItem(raw);
      if (seen.has(item.productId)) continue;
      if (!opts.includeAds && item.ad) continue;
      if (opts.onSaleOnly && item.saleStatus !== "판매중") continue;
      if (opts.condition === "used" && item.condition !== "중고") continue;
      if (opts.freeShippingOnly && !item.freeShipping) continue;
      seen.add(item.productId);
      collected.push(item);
      if (collected.length >= wanted) break;
    }

    if (list.length < PAGE_SIZE) break;
  }

  return { items: collected, totalFound };
}

export async function search(opts: SearchOptions): Promise<SearchResult> {
  if (!opts.keyword && !opts.categoryId && !opts.sellerId) {
    throw new Error("keyword, categoryId, sellerId 중 최소 하나는 지정해야 한다.");
  }
  const reqRef = opts.sellerId ? "shop" : opts.keyword ? "search" : "category";
  const { items, totalFound } = await collect(opts, reqRef);

  return {
    query: {
      keyword: opts.keyword,
      categoryId: opts.categoryId,
      sellerId: opts.sellerId,
      sort: opts.sort ?? "score",
      condition: opts.condition ?? "any",
      minPrice: opts.minPrice,
      maxPrice: opts.maxPrice,
    },
    totalFound,
    returned: items.length,
    products: items,
  };
}

/** 상품 ID 또는 상품 URL 에서 숫자 ID 를 뽑아낸다. */
export function parseProductId(input: string): string {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/products?\/(\d+)/);
  if (match) return match[1];
  throw new Error(`상품 ID 를 찾을 수 없다: ${input}`);
}

interface RawDetail {
  data: {
    product: Record<string, any>;
    shop?: Record<string, any>;
    shopProductCount?: number;
    shopProducts?: RawListItem[];
  };
}

export async function getProductDetail(input: string) {
  const pid = parseProductId(input);
  const res = await apiGet<RawDetail>(`/api/pms/v3/products-detail/${pid}`, {
    viewerUid: -1,
  });
  const p = res.data.product ?? {};
  const shop = res.data.shop ?? {};

  const imageCount: number = Number(p.imageCount ?? 1);
  const images = Array.from({ length: Math.min(imageCount, 12) }, (_, i) =>
    resolveImageUrl(String(p.imageUrl ?? ""), i + 1, 800),
  ).filter(Boolean);

  return {
    productId: String(p.pid ?? pid),
    name: p.name ?? "",
    description: p.description ?? "",
    price: Number(p.price ?? 0),
    originPrice: Number(p.originPrice ?? p.price ?? 0),
    quantity: p.qty ?? null,
    saleStatus: p.saleStatus ?? null,
    condition: p.condition ?? null,
    ad: Boolean(p.ad),
    keywords: p.keywords ?? [],
    category: {
      id: p.category?.id ?? null,
      name: p.category?.name ?? null,
      path: (p.categories ?? []).map((c: any) => c.name).join(" > "),
    },
    location: p.geo?.address ?? p.geoLabel ?? "",
    trade: {
      freeShipping: Boolean(p.trade?.freeShipping),
      inPerson: Boolean(p.trade?.inPerson),
      safePayment: Boolean(p.bunpayHope),
    },
    metrics: {
      viewCount: p.metrics?.viewCount ?? 0,
      favoriteCount: p.metrics?.favoriteCount ?? 0,
      chatCount: p.metrics?.buntalkCount ?? 0,
      commentCount: p.metrics?.commentCount ?? 0,
    },
    updatedAt: p.updatedAt ?? null,
    createdAt: p.describedAt ?? null,
    updatedBefore: p.updatedBefore ?? null,
    options: p.options ?? [],
    images,
    seller: {
      sellerId: shop.uid != null ? String(shop.uid) : null,
      name: shop.name ?? null,
      proshop: Boolean(shop.proshop?.isProshop),
      reviewRating: shop.reviewRating ?? null,
      reviewCount: shop.reviewCount ?? null,
      salesCount: shop.salesCount ?? null,
      followerCount: shop.followerCount ?? null,
      joinDate: shop.joinDate ?? null,
      productCount: res.data.shopProductCount ?? null,
      url: shop.uid != null ? shopUrl(shop.uid) : null,
    },
    url: productUrl(pid),
  };
}

export interface PriceStatsOptions extends Omit<SearchOptions, "limit" | "sort"> {
  /** 통계에 사용할 표본 수 (기본 100, 최대 300) */
  sampleSize?: number;
  /** "삽니다/매입" 같은 구매 희망 글도 표본에 포함할지 (기본 false) */
  includeWantedAds?: boolean;
}

/**
 * 번개장터에는 판매 글에 섞여 "최고가 매입합니다" 류의 구매 희망 글이 올라온다.
 * 가격이 터무니없이 높거나 낮아 시세를 크게 왜곡하므로 기본적으로 제외한다.
 */
const WANTED_AD_PATTERN =
  /(삽니다|사요|삼|매입|수거|구해요|구합니다|팝니다\s*아님|고가매입|최고가)/;

function isWantedAd(name: string): boolean {
  return WANTED_AD_PATTERN.test(name.replace(/\s+/g, ""));
}

/** 검색 표본으로 중고 시세를 요약한다. 이상치 판단은 사분위수로 한다. */
export async function priceStats(opts: PriceStatsOptions) {
  const sampleSize = Math.min(opts.sampleSize ?? 100, 300);
  const result = await search({
    ...opts,
    sort: "score",
    limit: sampleSize,
  });

  const usable = opts.includeWantedAds
    ? result.products
    : result.products.filter((p) => !isWantedAd(p.name));
  const excludedWantedAds = result.products.length - usable.length;

  const prices = usable
    .map((p) => p.price)
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);

  if (prices.length === 0) {
    return {
      ...result.query,
      sampleCount: 0,
      excludedWantedAds,
      note: "표본이 없어 시세를 낼 수 없다.",
    };
  }

  const quantile = (q: number) => {
    const pos = (prices.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return Math.round(prices[lo] + (prices[hi] - prices[lo]) * (pos - lo));
  };
  const sum = prices.reduce((a, b) => a + b, 0);

  const p25 = quantile(0.25);
  const p75 = quantile(0.75);
  // IQR 밖(급매·부품용·허위매물)을 뺀 평균이 체감 시세에 가장 가깝다.
  const inRange = prices.filter((p) => p >= p25 && p <= p75);
  const trimmedMean = Math.round(inRange.reduce((a, b) => a + b, 0) / inRange.length);

  return {
    ...result.query,
    totalFound: result.totalFound,
    sampleCount: prices.length,
    /** 시세 왜곡을 막으려고 제외한 "삽니다/매입" 글 수 */
    excludedWantedAds,
    min: prices[0],
    max: prices[prices.length - 1],
    mean: Math.round(sum / prices.length),
    median: quantile(0.5),
    p25,
    p75,
    /** 사분위 범위 안쪽만 평균 낸 값. 대표 시세로 쓰기 좋다. */
    trimmedMean,
    /** 이 범위를 벗어나면 급매·부품용·허위매물일 가능성이 높다. */
    typicalRange: [p25, p75] as [number, number],
    cheapest: usable
      .filter((p) => p.price > 0)
      .sort((a, b) => a.price - b.price)
      .slice(0, 5),
  };
}

let categoryCache: { tree: CategoryNode[]; fetchedAt: number } | null = null;

async function getCategoryTree(): Promise<CategoryNode[]> {
  if (categoryCache && Date.now() - categoryCache.fetchedAt < CATEGORY_TTL) {
    return categoryCache.tree;
  }
  const res = await apiGet<{ categories: CategoryNode[] }>("/api/1/categories/list.json", {
    version: 4,
  });
  categoryCache = { tree: res.categories ?? [], fetchedAt: Date.now() };
  return categoryCache.tree;
}

function flatten(
  nodes: CategoryNode[],
  path: string[] = [],
): Array<{ id: string; title: string; path: string; count: number; depth: number }> {
  const out: Array<{ id: string; title: string; path: string; count: number; depth: number }> = [];
  for (const node of nodes) {
    const nextPath = [...path, node.title];
    out.push({
      id: node.id,
      title: node.title,
      path: nextPath.join(" > "),
      count: node.count ?? 0,
      depth: nextPath.length,
    });
    if (node.categories?.length) out.push(...flatten(node.categories, nextPath));
  }
  return out;
}

/**
 * 카테고리를 조회한다.
 * - query 를 주면 이름으로 검색해 하위 카테고리까지 찾아준다.
 * - parentId 를 주면 그 아래 한 단계만 나열한다.
 * - 둘 다 없으면 최상위 목록을 준다.
 */
export async function categories(opts: { query?: string; parentId?: string; limit?: number }) {
  const tree = await getCategoryTree();
  const limit = opts.limit ?? 50;

  if (opts.query) {
    const q = opts.query.toLowerCase();
    const matched = flatten(tree)
      .filter((c) => c.title.toLowerCase().includes(q) || c.path.toLowerCase().includes(q))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
    return { mode: "search", query: opts.query, count: matched.length, categories: matched };
  }

  if (opts.parentId) {
    const stack = [...tree];
    while (stack.length) {
      const node = stack.shift()!;
      if (node.id === opts.parentId) {
        return {
          mode: "children",
          parent: { id: node.id, title: node.title, count: node.count },
          categories: (node.categories ?? []).map((c) => ({
            id: c.id,
            title: c.title,
            count: c.count ?? 0,
            hasChildren: Boolean(c.categories?.length),
          })),
        };
      }
      if (node.categories?.length) stack.push(...node.categories);
    }
    throw new Error(`카테고리를 찾을 수 없다: ${opts.parentId}`);
  }

  return {
    mode: "root",
    categories: tree.map((c) => ({
      id: c.id,
      title: c.title,
      count: c.count ?? 0,
      hasChildren: Boolean(c.categories?.length),
    })),
  };
}
