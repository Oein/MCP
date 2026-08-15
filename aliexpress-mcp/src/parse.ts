import { BASE_URL } from "./config.js";
import type {
  Price,
  ProductDetail,
  ReviewItem,
  SearchItem,
  SkuVariant,
  StoreInfo,
} from "./types.js";

/** 프로토콜 없는 `//host/...` 이미지 경로를 https 로 보정한다. */
export function absUrl(u?: string): string | undefined {
  if (!u) return undefined;
  if (u.startsWith("//")) return `https:${u}`;
  return u;
}

export function itemUrl(productId: string): string {
  return `${BASE_URL}/item/${productId}.html`;
}

/** "₩1,442|1442|" 또는 "₩ 1,250" 에서 숫자만 뽑는다. */
export function parseAmount(text?: string): number | undefined {
  if (!text) return undefined;
  // salePriceLocal 은 "표시가|숫자|" 형태라 두 번째 필드가 가장 정확하다.
  const parts = text.split("|");
  if (parts.length > 1 && parts[1] && /^[\d.]+$/.test(parts[1].trim())) {
    return Number(parts[1]);
  }
  const m = text.replace(/[^\d.,]/g, "").replace(/,/g, "");
  const n = Number(m);
  return Number.isFinite(n) && m !== "" ? n : undefined;
}

/** "10,000+ 판매" / "2,816 reviews" 에서 수량을 뽑는다. */
export function parseCount(text?: string): number | undefined {
  if (!text) return undefined;
  const m = text.match(/[\d.,]+/);
  if (!m) return undefined;
  const n = Number(m[0].replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

/* ------------------------------------------------------------------ */
/* 검색                                                                */
/* ------------------------------------------------------------------ */

/**
 * 검색 페이지의 `window._dida_config_._init_data_` 에서 상품 배열을 꺼낸다.
 * 컴포넌트 키에 빌드마다 바뀌는 숫자 접미사가 붙으므로 경로를 넓게 훑는다.
 */
export function extractSearchItems(init: any): any[] {
  const direct = init?.data?.data?.root?.fields?.mods?.itemList?.content;
  if (Array.isArray(direct)) return direct;

  // 레이아웃이 바뀐 경우를 대비해 itemList.content 를 재귀 탐색한다.
  const found: any[] = [];
  const walk = (node: any, depth: number) => {
    if (found.length || depth > 8 || !node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const v of node.slice(0, 20)) walk(v, depth + 1);
      return;
    }
    const content = node.itemList?.content;
    if (Array.isArray(content) && content.some((c: any) => c?.productId)) {
      found.push(...content);
      return;
    }
    for (const k of Object.keys(node)) walk(node[k], depth + 1);
  };
  walk(init, 0);
  return found;
}

export function normalizeSearchItem(raw: any): SearchItem | null {
  const productId = String(raw?.productId ?? raw?.redirectedId ?? "");
  if (!productId || productId === "undefined") return null;

  const p = raw.prices ?? {};
  const sale = p.salePrice ?? {};
  const original = p.originalPrice ?? {};
  const price: Price = {
    currency: sale.currencyCode ?? original.currencyCode ?? p.currencySymbol,
    sale: sale.minPrice,
    saleText: sale.formattedPrice,
    original: original.minPrice,
    originalText: original.formattedPrice,
    discountPercent: sale.discount ?? sale.minPriceDiscount,
  };

  const tags = (raw.sellingPoints ?? [])
    .map((s: any) => s?.tagContent?.tagText || s?.source)
    .filter((t: unknown): t is string => typeof t === "string" && t.length > 0);

  return {
    productId,
    title: raw.title?.displayTitle ?? "",
    url: itemUrl(productId),
    image: absUrl(raw.image?.imgUrl),
    price,
    rating: raw.evaluation?.starRating,
    ordersText: raw.trade?.tradeDesc,
    orders: parseCount(raw.trade?.tradeDesc),
    tags: tags.length ? tags : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* 상세                                                                */
/* ------------------------------------------------------------------ */

function priceFromInfo(info: any): Price {
  if (!info) return {};
  const original = info.originalPrice ?? {};
  const sale = parseAmount(info.salePriceLocal) ?? undefined;
  const price: Price = {
    currency: original.currency,
    sale,
    saleText: info.salePriceString ?? info.salePriceLocal?.split("|")[0],
    original: original.value,
    originalText: original.formatedAmount,
  };
  if (price.sale && price.original && price.original > price.sale) {
    price.discountPercent = Math.round(
      ((price.original - price.sale) / price.original) * 100,
    );
  }
  return price;
}

/**
 * skuAttr 문자열을 속성 맵으로 변환한다.
 * 예: "200007763:201336100;14:193#USB-A to Lightning;200001036:200007624#200cm"
 */
function parseSkuAttr(
  skuAttr: string,
  propNames: Map<string, string>,
  valueNames: Map<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const seg of String(skuAttr ?? "").split(";")) {
    if (!seg) continue;
    const [ids, inlineName] = seg.split("#");
    const [propId, valueId] = ids.split(":");
    const name = propNames.get(propId) ?? propId;
    const value = inlineName ?? valueNames.get(`${propId}:${valueId}`) ?? valueId;
    if (name && value) out[name] = value;
  }
  return out;
}

/** SHIPPING 모듈의 레이아웃 데이터에서 쓸 만한 배송 정보만 뽑는다. */
function parseShipping(mod: any): ProductDetail["shipping"] {
  const layout = mod?.deliveryLayoutInfo?.[0] ?? mod?.originalLayoutResultList?.[0];
  const biz = layout?.bizData ?? {};
  const notes = (layout?.additionLayout ?? [])
    .map((b: any) => b?.content)
    .filter((c: unknown): c is string => typeof c === "string" && c.length > 0);

  const shipping = {
    shipFrom: biz.shipFrom,
    shipTo: biz.shipToCode,
    estimatedArrival: biz.displayEtaMinDate,
    maxDeliveryDays: biz.deliveryDayMax,
    freeShippingThreshold: biz.logisticsComposeThreshold,
    trackingAvailable: biz.tracking ? biz.tracking === "visible" : undefined,
    notes: notes.length ? notes : undefined,
  };

  return Object.values(shipping).some((v) => v !== undefined) ? shipping : undefined;
}

function parseStore(shop: any, globalData: any): StoreInfo {
  const seller = shop?.sellerInfo ?? {};
  const scores: Record<string, string> = {};
  for (const b of shop?.benefitInfoList ?? []) {
    if (b?.title && b?.value) scores[b.title] = String(b.value);
  }
  return {
    storeId: seller.storeNum != null ? String(seller.storeNum) : undefined,
    name: shop?.storeName,
    url: shop?.storeHomePage,
    sellerId:
      globalData?.sellerId != null
        ? String(globalData.sellerId)
        : seller.adminSeq != null
          ? String(seller.adminSeq)
          : undefined,
    positiveRate: shop?.sellerPositiveRate,
    followers: parseCount(shop?.storeHeaderResult?.followerNumber),
    openedAt: seller.formatOpenTime ?? seller.openTime,
    country: seller.countryCompleteName,
    scores: Object.keys(scores).length ? scores : undefined,
  };
}

/** mtop.aliexpress.pdp.pc.query 응답의 `data.result` 를 정규화한다. */
export function normalizeDetail(
  result: any,
  productId: string,
  signedIn?: boolean,
): ProductDetail {
  const globalData = result?.GLOBAL_DATA?.globalData ?? {};
  const priceMod = result?.PRICE ?? {};
  const skuMod = result?.SKU ?? {};
  const quantity = result?.QUANTITY_PC ?? {};

  // 속성 ID → 이름 사전 (skuAttr 문자열 해석용)
  const propNames = new Map<string, string>();
  const valueNames = new Map<string, string>();
  const skuOptions: { name: string; values: string[] }[] = [];
  for (const prop of skuMod.skuProperties ?? []) {
    const pid = String(prop.skuPropertyId);
    propNames.set(pid, prop.skuPropertyName);
    const values: string[] = [];
    for (const v of prop.skuPropertyValues ?? []) {
      const label = v.propertyValueDisplayName || v.propertyValueName;
      valueNames.set(`${pid}:${v.propertyValueIdLong ?? v.propertyValueId}`, label);
      if (label) values.push(label);
    }
    if (prop.skuPropertyName) {
      skuOptions.push({ name: prop.skuPropertyName, values });
    }
  }

  const priceMap = priceMod.skuIdStrPriceInfoMap ?? priceMod.skuPriceInfoMap ?? {};
  const quantityMap = quantity.allSkuQuantityView ?? {};

  const skus: SkuVariant[] = (skuMod.skuPaths ?? []).map((path: any): SkuVariant => {
    const skuId = String(path.skuIdStr ?? path.skuId);
    const qty = quantityMap[skuId] ?? {};
    return {
      skuId,
      attributes: parseSkuAttr(path.skuAttr, propNames, valueNames),
      price: priceFromInfo(priceMap[skuId]),
      inStock: path.salable !== false && qty.maxBuyCount !== 0,
      stock: path.skuStock,
    };
  });

  const specs: Record<string, string> = {};
  for (const p of result?.PRODUCT_PROP_PC?.showedProps ??
    result?.PRODUCT_PROP_PC?.outerProps ??
    []) {
    if (p?.attrName) specs[p.attrName] = String(p.attrValue ?? "");
  }

  const images: string[] = (result?.HEADER_IMAGE_PC?.imagePathList ?? [])
    .map((u: string) => absUrl(u))
    .filter(Boolean) as string[];

  const rating = result?.PC_RATING ?? {};
  const shippingMod = result?.SHIPPING ?? {};

  return {
    productId,
    title: result?.PRODUCT_TITLE?.text ?? globalData.subject ?? "",
    url: itemUrl(productId),
    images,
    price: priceFromInfo(priceMod.targetSkuPriceInfo),
    rating: rating.rating != null ? Number(rating.rating) : undefined,
    reviewCount: rating.totalValidNum,
    ordersText: rating.otherText,
    availableStock: quantity.totalAvailableInventory,
    store: parseStore(result?.SHOP_CARD_PC, globalData),
    specs,
    skuOptions,
    skus,
    shipping: parseShipping(shippingMod),
    descriptionUrl: result?.DESC?.pcDescUrl ?? result?.DESC?.msiteDescUrl,
    signedIn,
  };
}

/* ------------------------------------------------------------------ */
/* 리뷰                                                                */
/* ------------------------------------------------------------------ */

/** mtop.aliexpress.review.pc.list 응답을 정규화한다. */
export function normalizeReviews(payload: any): ReviewItem[] {
  const list =
    payload?.data?.evaViewList ??
    payload?.data?.reviewList ??
    payload?.evaViewList ??
    [];
  return (Array.isArray(list) ? list : []).map((r: any): ReviewItem => ({
    author: r.buyerName ?? r.userNick,
    country: r.buyerCountry ?? r.countryFullName,
    rating: r.buyerEval != null ? Number(r.buyerEval) / 20 : r.starRating,
    date: r.evalDate ?? r.gmtCreate,
    content: r.buyerFeedback ?? r.content,
    skuInfo: r.skuInfo,
    images: (r.images ?? r.imageList ?? [])
      .map((i: any) => absUrl(typeof i === "string" ? i : i?.url))
      .filter(Boolean),
    helpfulCount: r.upVoteCount ?? r.usefulCount,
  }));
}

/** mtop 응답은 `mtopjsonp1({...})` 로 감싸져 오기도 한다. */
export function unwrapMtop(text: string): any {
  const trimmed = text.trim();
  const m = trimmed.match(/^\s*mtopjsonp\d*\s*\((.*)\)\s*;?\s*$/s);
  return JSON.parse(m ? m[1] : trimmed);
}
