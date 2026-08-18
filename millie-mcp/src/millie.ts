import { apiGetEnveloped, apiGetFlat, MillieApiError } from "./api.js";
import { authHeaders, explainAuthFailure, loadCredentials } from "./auth.js";
import { API_BASE, LIVE_API_BASE, WEB_BASE } from "./config.js";
import type {
  AutoCompleteData,
  Book,
  RawBook,
  RawBookSummary,
  SearchTotalData,
} from "./types.js";

/** 도서 웹 페이지 링크. `/detail/{id}` 는 404 라서 `/v3/detail/{id}` 를 쓴다. */
function bookUrl(bookId: string): string {
  return `${WEB_BASE}/v3/detail/${bookId}`;
}

/** `20230102000000` 같은 14자리 타임스탬프를 `2023-01-02` 로. */
function toDate(value: string | undefined): string | undefined {
  if (!value || value.length < 8) return undefined;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function toNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function joinCategory(a?: string, b?: string): string | undefined {
  const parts = [a, b].filter((p): p is string => Boolean(p));
  return parts.length ? parts.join(" > ") : undefined;
}

function normalizeBook(raw: RawBook): Book {
  const seriesCount = toNumber(raw.series_count) ?? 0;
  const book: Book = {
    bookId: raw.book_id ?? raw.book_seq,
    title: raw.content_name,
    subtitle: raw.subtitle || undefined,
    author: raw.author || undefined,
    publisher: raw.book_brand?.trim() || undefined,
    category: joinCategory(raw.category, raw.category2),
    isbn: raw.book_isbn || undefined,
    publishedAt: toDate(raw.ebook_published_at),
    coverUrl: raw.content_thumb_url || undefined,
    url: bookUrl(raw.book_id ?? raw.book_seq),
    available: raw.is_service !== false,
    free: raw.is_free === true,
    rentable: raw.is_ebook_rent === true,
    adult: raw.is_adult === "Y",
    // 오디오북은 낭독자 정보나 오디오 아이콘 값으로만 구분된다. 별도 타입 필드가 없다.
    audiobook: Boolean(raw.reader_name) || (toNumber(raw.audio_category_icon_value) ?? 0) > 0,
    readerName: raw.reader_name || undefined,
    readCount: toNumber(raw.content_take_count),
    reviewCount: toNumber(raw.content_review_count),
  };
  if (raw.is_series || seriesCount > 0) {
    book.series = { name: raw.series_group_name || undefined, count: seriesCount };
  }
  // coming_soon_date 가 있으면 아직 서비스 오픈 전인 예정작이다.
  const comingSoon = raw.open_date || toDate(raw.coming_soon_date);
  if (comingSoon && raw.is_service === false) book.comingSoonAt = comingSoon;
  return book;
}

async function searchTotal(
  keyword: string,
  page: number,
  count: number,
): Promise<SearchTotalData> {
  return apiGetEnveloped<SearchTotalData>(LIVE_API_BASE, "v3/search/total", {
    keyword,
    searchType: "total",
    contentlimitCount: count,
    startPage: page,
  });
}

export interface SearchOptions {
  keyword: string;
  page?: number;
  count?: number;
  availableOnly?: boolean;
  audiobookOnly?: boolean;
  raw?: boolean;
}

/**
 * 도서 검색.
 *
 * 정렬 파라미터는 없다 — `sortType`/`sort` 를 붙여도 응답 순서가 바뀌지 않는다.
 * 항상 밀리의 관련도 순이다.
 */
export async function search(opts: SearchOptions): Promise<Record<string, unknown>> {
  const page = opts.page ?? 1;
  const count = opts.count ?? 20;
  const data = await searchTotal(opts.keyword, page, count);
  const content = data.content ?? { list: [], total: 0 };

  if (opts.raw) {
    return { keyword: opts.keyword, page, count, total: content.total, results: content.list };
  }

  let books = content.list.map(normalizeBook);
  const before = books.length;
  if (opts.availableOnly) books = books.filter((b) => b.available);
  if (opts.audiobookOnly) books = books.filter((b) => b.audiobook);

  return {
    keyword: opts.keyword,
    page,
    count,
    // total 은 서버가 준 전체 건수라서 필터링 전 기준이다.
    total: content.total,
    returned: books.length,
    ...(before !== books.length ? { filteredOut: before - books.length } : {}),
    hasMore: page * count < content.total,
    suggestKeyword: data.suggestKeyword?.length ? data.suggestKeyword : undefined,
    results: books,
  };
}

/** 검색어 자동완성. 인기 순으로 정렬돼 온다. */
export async function autocomplete(
  keyword: string,
  limit = 10,
): Promise<Record<string, unknown>> {
  const data = await apiGetEnveloped<AutoCompleteData>(
    LIVE_API_BASE,
    "v2/search/autoComplete",
    { keyword },
  );
  return {
    keyword,
    suggestions: (data.normal ?? []).slice(0, limit),
    categories: (data.category ?? []).map((c) => ({
      name: joinCategory(c.category1, c.category2),
      categorySeq: c.category_seq,
      subCategorySeq: c.category2_seq,
    })),
  };
}

export interface SectionOptions {
  keyword: string;
  sections?: ("library" | "post" | "millie_road")[];
  limit?: number;
}

/**
 * 도서 외 섹션 검색. 같은 `/v3/search/total` 응답의 다른 가지를 꺼내 쓴다.
 * 밀리 검색은 한 번의 호출로 전 섹션을 돌려주므로 추가 요청이 아니다.
 */
export async function searchSections(opts: SectionOptions): Promise<Record<string, unknown>> {
  const limit = opts.limit ?? 10;
  const wanted = opts.sections ?? ["library", "post", "millie_road"];
  const data = await searchTotal(opts.keyword, 1, limit);
  const out: Record<string, unknown> = { keyword: opts.keyword };

  if (wanted.includes("library")) {
    out.library = {
      total: data.library?.total ?? 0,
      list: (data.library?.list ?? []).slice(0, limit).map((l) => ({
        librarySeq: l.library_seq,
        name: l.library_name,
        followerCount: toNumber(l.follower_count),
        bookshelfCount: toNumber(l.bookshlef_count),
        postCount: toNumber(l.post_count),
        profileThumb: l.library_profile_thumb || undefined,
      })),
    };
  }
  if (wanted.includes("post")) {
    out.post = {
      total: data.post?.total ?? 0,
      list: (data.post?.list ?? []).slice(0, limit).map((p) => ({
        postSeq: p.post_seq,
        title: p.post_title || undefined,
        // 본문은 HTML 이라 태그를 걷어내고 앞부분만 준다.
        excerpt: p.post_content_html
          ? p.post_content_html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300)
          : undefined,
        libraryName: p.post_library_name || undefined,
        bookTitle: p.main_content_name || undefined,
        bookId: p.main_book_seq || undefined,
        likeCount: toNumber(p.like_count),
        commentCount: toNumber(p.comment_count),
        createdAt: p.created_at,
      })),
    };
  }
  if (wanted.includes("millie_road")) {
    out.millieRoad = {
      total: data.millie_road?.total ?? 0,
      list: (data.millie_road?.list ?? []).slice(0, limit).map((r) => ({
        title: r.title,
        author: r.mem_nickname || undefined,
        description: r.description || undefined,
        episodeCount: toNumber(r.episode_count),
        category: r.category || undefined,
      })),
    };
  }
  return out;
}

/** 도서 ID 또는 밀리 상세 페이지 URL 에서 ID 를 뽑는다. */
export function resolveBookId(input: string): string {
  const trimmed = input.trim();
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;
  const match = trimmed.match(/\/detail\/([0-9a-f]+)/i);
  if (!match) throw new MillieApiError(`URL 에서 도서 ID 를 찾지 못했다: ${input}`, 0, "resolve");
  return match[1];
}

/**
 * 도서 상세. 이 엔드포인트만 Bearer 토큰이 필요하다 (무인증이면 403).
 * 줄거리·리뷰는 여기 없고 페이지 수·파일 크기·서비스 상태 같은 메타데이터가 온다.
 */
export async function bookDetail(
  input: string,
  raw = false,
): Promise<Record<string, unknown>> {
  const bookId = resolveBookId(input);
  const cred = loadCredentials();

  let data: RawBookSummary;
  try {
    data = await apiGetFlat<RawBookSummary>(
      API_BASE,
      `v3/content/summary/book/${bookId}/`,
      {},
      authHeaders(cred),
    );
  } catch (e) {
    // 인증 실패면 토큰 만료가 원인일 가능성이 높으니 그 사실을 함께 알린다.
    if (e instanceof MillieApiError && (e.status === 401 || e.status === 403)) {
      throw explainAuthFailure(cred, e);
    }
    throw e;
  }
  if (raw) return data as unknown as Record<string, unknown>;

  const badge = (data.badge ?? {}) as Record<string, boolean | null>;
  return {
    bookId: data.book_id ?? bookId,
    title: data.content_name,
    subtitle: data.book_sub_name || undefined,
    author: data.author || undefined,
    publisher: data.publisher || undefined,
    publishedAt: data.published_at ?? data.ebook_publish_date,
    coverUrl: data.content_thumb_url || undefined,
    url: bookUrl(data.book_id ?? bookId),
    totalPages: data.total_page,
    fileSizeMb: data.file_size ? Number((data.file_size / 1024 / 1024).toFixed(1)) : undefined,
    available: data.is_serviced === true,
    rentable: data.can_rent === true,
    free: data.is_free === true,
    adult: data.is_adult === true,
    favorite: data.is_favorite === true,
    tts: data.tts_yn === "Y",
    aiTts: data.ai_tts_yn === "Y",
    audiobook: badge.is_audiobook === true,
    readerName: data.reader_name || undefined,
    audiobookPlayTime: data.audiobook_play_time ?? undefined,
    format: badge.is_pdf === true ? "pdf" : badge.is_comic === true ? "comic" : "epub",
    series:
      data.series_name || data.series_count
        ? { name: data.series_name ?? undefined, count: toNumber(data.series_count) ?? 0 }
        : undefined,
  };
}
