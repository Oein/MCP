/** find_v2.json 이 돌려주는 목록 아이템 (필요한 필드만). */
export interface RawListItem {
  pid: string;
  name: string;
  price: string;
  product_image: string;
  status: string;
  ad: boolean;
  care: boolean;
  location: string;
  free_shipping: boolean;
  num_comment: string;
  num_faved: string;
  update_time: number;
  used: number;
  uid: string;
  proshop: boolean;
  category_id: string;
  checkout: boolean;
  bizseller: boolean;
  inspection: string;
}

export interface RawFindResponse {
  result?: string;
  list?: RawListItem[];
  num_found?: number;
  no_result?: boolean;
  errorCode?: string;
  reason?: string;
}

/** 툴이 반환하는 정규화된 상품 요약. */
export interface ProductSummary {
  productId: string;
  name: string;
  price: number;
  /** "판매중" | "예약중" | "판매완료" */
  saleStatus: string;
  /** "중고" | "새상품" | "unknown" */
  condition: string;
  location: string;
  freeShipping: boolean;
  /** 번개페이(안전결제) 지원 여부 */
  safePayment: boolean;
  favoriteCount: number;
  commentCount: number;
  /** 끌올/수정 시각 (ISO8601) */
  updatedAt: string;
  categoryId: string;
  sellerId: string;
  /** 전문판매자(프로샵) 여부 */
  proshop: boolean;
  /** 광고 노출 상품인지 */
  ad: boolean;
  imageUrl: string;
  url: string;
}

export interface CategoryNode {
  id: string;
  title: string;
  count: number;
  categories?: CategoryNode[];
}
