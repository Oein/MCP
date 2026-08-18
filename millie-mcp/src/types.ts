/** 밀리 API 공통 봉투. 검색·자동완성 계열이 이 형태로 감싸서 돌려준다. */
export interface MillieEnvelope<T> {
  RESP_CD: number;
  RESP_MSG: string;
  RESP_DATA: T;
}

export interface MillieSection<T> {
  list: T[];
  total: number;
}

/** `/v3/search/total` 의 RESP_DATA. 도서 외 섹션까지 한 번에 돌려준다. */
export interface SearchTotalData {
  content: MillieSection<RawBook>;
  library: MillieSection<RawLibrary>;
  post: MillieSection<RawPost>;
  millie_road: MillieSection<RawRoad>;
  story: MillieSection<unknown>;
  suggestKeyword: string[];
}

export interface RawBook {
  book_id: string;
  book_seq: string;
  content_name: string;
  subtitle?: string;
  author?: string;
  book_brand?: string;
  category?: string;
  category2?: string;
  content_thumb_url?: string;
  book_isbn?: string;
  ebook_published_at?: string;
  is_service?: boolean;
  is_free?: boolean;
  is_adult?: string;
  is_ebook_rent?: boolean;
  is_series?: boolean;
  series_count?: string;
  series_group_name?: string;
  reader_name?: string;
  audio_category_icon_value?: string;
  audiobook_volume?: string;
  content_take_count?: string;
  content_review_count?: string;
  coming_soon_date?: string;
  open_date?: string;
  [key: string]: unknown;
}

export interface RawLibrary {
  library_seq: string;
  library_name: string;
  library_profile_thumb?: string;
  follower_count?: string;
  bookshlef_count?: string;
  post_count?: string;
  [key: string]: unknown;
}

export interface RawPost {
  post_seq: string;
  post_title?: string;
  post_content_html?: string;
  post_library_name?: string;
  main_content_name?: string;
  main_book_seq?: string;
  like_count?: number | string;
  comment_count?: number | string;
  created_at?: string;
  [key: string]: unknown;
}

export interface RawRoad {
  title: string;
  mem_nickname?: string;
  description?: string;
  episode_count?: number | string;
  category?: string;
  thumbnail_url?: string;
  [key: string]: unknown;
}

export interface AutoCompleteData {
  normal: string[];
  category: { category1?: string; category2?: string; category_seq?: string; category2_seq?: string }[];
}

/** `/v3/content/summary/book/{id}/` 응답. 봉투 없이 평평하게 온다. */
export interface RawBookSummary {
  book_id: string;
  content_name: string;
  book_sub_name?: string;
  author?: string;
  publisher?: string;
  published_at?: string;
  ebook_publish_date?: string;
  content_thumb_url?: string;
  total_page?: number;
  file_size?: number;
  is_serviced?: boolean;
  can_rent?: boolean;
  is_free?: boolean;
  is_adult?: boolean;
  is_favorite?: boolean;
  tts_yn?: string;
  ai_tts_yn?: string;
  reader_name?: string;
  audiobook_play_time?: number | string | null;
  series_name?: string | null;
  series_count?: number | string | null;
  badge?: Record<string, unknown>;
  [key: string]: unknown;
}

/** 정규화된 도서 요약. 검색 결과 항목마다 이 형태로 돌려준다. */
export interface Book {
  bookId: string;
  title: string;
  subtitle?: string;
  author?: string;
  publisher?: string;
  category?: string;
  isbn?: string;
  publishedAt?: string;
  coverUrl?: string;
  url: string;
  available: boolean;
  free: boolean;
  rentable: boolean;
  adult: boolean;
  audiobook: boolean;
  readerName?: string;
  series?: { name?: string; count: number };
  readCount?: number;
  reviewCount?: number;
  /** 아직 오픈되지 않은 예정작이면 공개 예정 시각. */
  comingSoonAt?: string;
}
