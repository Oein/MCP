export interface Price {
  currency?: string;
  /** 실제 결제가 (할인 적용 후) */
  sale?: number;
  saleText?: string;
  /** 할인 전 정가 */
  original?: number;
  originalText?: string;
  /** 할인율(%) */
  discountPercent?: number;
}

export interface SearchItem {
  productId: string;
  title: string;
  url: string;
  image?: string;
  price: Price;
  rating?: number;
  /** "10,000+ 판매" 같은 원문 표기 */
  ordersText?: string;
  /** ordersText 에서 뽑아낸 대략적인 판매 수량 */
  orders?: number;
  tags?: string[];
}

export interface SearchResult {
  keyword: string;
  page: number;
  sort: string;
  count: number;
  items: SearchItem[];
}

export interface SkuVariant {
  skuId: string;
  /** 속성명 → 값 (예: { 색상: "USB-A to Lightning" }) */
  attributes: Record<string, string>;
  price: Price;
  inStock: boolean;
  stock?: number;
}

export interface StoreInfo {
  storeId?: string;
  name?: string;
  url?: string;
  sellerId?: string;
  positiveRate?: string;
  followers?: number;
  openedAt?: string;
  country?: string;
  scores?: Record<string, string>;
}

export interface ProductDetail {
  productId: string;
  title: string;
  url: string;
  images: string[];
  price: Price;
  rating?: number;
  reviewCount?: number;
  ordersText?: string;
  availableStock?: number;
  store: StoreInfo;
  /** 상품 사양 (속성명 → 값) */
  specs: Record<string, string>;
  skuOptions: { name: string; values: string[] }[];
  skus: SkuVariant[];
  shipping?: {
    shipFrom?: string;
    shipTo?: string;
    /** 예상 도착 시작일 (사이트 표기 그대로) */
    estimatedArrival?: string;
    /** 최대 배송 소요일 */
    maxDeliveryDays?: number;
    /** 무료배송 기준 금액 표기 */
    freeShippingThreshold?: string;
    trackingAvailable?: boolean;
    /** 배송 관련 안내 문구 모음 */
    notes?: string[];
  };
  descriptionUrl?: string;
  /** 로그인 세션이 반영된 응답인지 */
  signedIn?: boolean;
}

export interface ReviewItem {
  author?: string;
  country?: string;
  rating?: number;
  date?: string;
  content?: string;
  skuInfo?: string;
  images?: string[];
  helpfulCount?: number;
}

export interface AuthStatus {
  loggedIn: boolean;
  /** 로그인된 계정 표시명 (알아낼 수 있는 경우) */
  account?: string;
  /** 저장된 세션 파일 존재 여부 */
  hasSavedSession: boolean;
  savedAt?: string;
  cookieCount?: number;
}
