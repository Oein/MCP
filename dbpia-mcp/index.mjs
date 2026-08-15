#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

const BASE_URL = "https://www.dbpia.co.kr";
const KCI_BASE_URL = "https://www.kci.go.kr";
const B2B_ID = process.env.DBPIA_B2B_ID || "";
const B2B_NAME = process.env.DBPIA_B2B_NAME || "";
const B2B_ACC = process.env.DBPIA_B2B_ACC || "";
const B2B_PASS = process.env.DBPIA_B2B_PASS || "";

let sessionCookie = "";
let loggedIn = false;
let lastLoginCheck = 0;
let kciSessionCookie = "";

// 로그인 후 이 시간이 지나면 /member/me로 세션 유효성을 재확인한다.
const LOGIN_RECHECK_MS = 5 * 60 * 1000;

async function request(path, options = {}) {
  const url = path.startsWith("http") ? path : BASE_URL + path;
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ...(options.headers || {}),
  };
  // 기관 로그인 쿠키는 DBpia 요청에만 전송한다. 다운로드 링크가 외부
  // 스토리지로 연결되는 경우에도 인증 쿠키가 유출되지 않도록 한다.
  if (sessionCookie && new URL(url).origin === BASE_URL) {
    headers["Cookie"] = sessionCookie;
  }
  const res = await fetch(url, { ...options, headers, redirect: "manual" });

  const setCookies =
    new URL(url).origin === BASE_URL ? res.headers.getSetCookie?.() || [] : [];
  if (setCookies.length) {
    const existing = parseCookies(sessionCookie);
    for (const sc of setCookies) {
      const [kv] = sc.split(";");
      const eqIdx = kv.indexOf("=");
      if (eqIdx > 0) {
        existing[kv.substring(0, eqIdx).trim()] = kv
          .substring(eqIdx + 1)
          .trim();
      }
    }
    sessionCookie = Object.entries(existing)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }
  return res;
}

function assertLookupNodeId(nodeId) {
  // 검색 결과에는 학술논문(NODE...)과 학위논문(T...)이 함께 나온다.
  if (!/^(?:NODE[A-Z0-9]+|T\d+)$/i.test(nodeId)) {
    throw new Error("유효하지 않은 Node ID입니다.");
  }
}

function assertNodeId(nodeId) {
  if (/^T\d+$/i.test(nodeId)) {
    // 검색 결과에는 T로 시작하는 학위논문이 함께 나오지만, DBpia 다운로드
    // API는 이 유형을 처리하지 못한다(500 응답).
    throw new Error("학위논문(T로 시작하는 ID)은 원문 다운로드를 지원하지 않습니다.");
  }
  if (!/^NODE[A-Z0-9]+$/i.test(nodeId)) {
    throw new Error("유효하지 않은 Node ID입니다.");
  }
}

function decodeFileName(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function fileNameForNode(nodeId, disposition) {
  const utf8Name = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const plainName = disposition?.match(/filename="?([^";]+)"?/i)?.[1];
  const suppliedName = utf8Name
    ? decodeFileName(utf8Name)
    : // DBpia는 filename*를 쓰지 않을 때도 값을 퍼센트 인코딩해서 보낸다.
      plainName && decodeFileName(plainName);
  // 응답 헤더의 파일명은 경로 구성 요소로 사용하지 않는다.
  const safeName = path
    .basename(suppliedName || "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/^\.+/, "")
    .trim();
  // 어떤 nodeId를 받아온 파일인지 파일명만으로 식별할 수 있어야 한다.
  // 제공처가 내부 파일 ID를 파일명으로 돌려주는 경우가 있기 때문이다.
  const title = safeName.replace(/\.pdf$/i, "");
  return title ? `${nodeId}_${title}.pdf` : `${nodeId}.pdf`;
}

function isPdfResponse(res, buffer) {
  const contentType = res.headers.get("content-type") || "";
  return contentType.includes("pdf") || buffer.subarray(0, 5).equals(Buffer.from("%PDF-"));
}

function assertCompletePdfResponse(res, buffer) {
  if (!isPdfResponse(res, buffer)) {
    throw new Error("원문 PDF 대신 다른 응답을 받았습니다.");
  }
  const expectedBytes = Number(res.headers.get("content-length"));
  if (Number.isFinite(expectedBytes) && expectedBytes > 0 && buffer.length !== expectedBytes) {
    throw new Error(`PDF 전송이 완료되지 않았습니다 (${buffer.length}/${expectedBytes} bytes).`);
  }
}

function countPdfPages(buffer) {
  // `/Pages` 트리 노드는 제외하고 실제 페이지 객체만 센다.
  return (buffer.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length;
}

function assertKciOriginalPdf(buffer, expectedPages) {
  // KCI의 서지정보 안내문은 정상 PDF이지만 통상 2쪽이다. 긴 논문에서
  // 이런 응답을 원문으로 저장하지 않는다.
  const pdfPages = countPdfPages(buffer);
  if (expectedPages >= 5 && pdfPages > 0 && pdfPages < 3) {
    throw new Error(`KCI가 원문 대신 ${pdfPages}쪽 서지정보 안내 PDF를 반환했습니다.`);
  }
}

async function fetchDownload(downloadUrl) {
  let url = new URL(downloadUrl, BASE_URL).toString();

  for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
    const res = await request(url, { redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(res.status)) return res;

    const location = res.headers.get("location");
    if (!location) throw new Error("PDF 다운로드 리디렉션 주소가 없습니다.");
    url = new URL(location, url).toString();
  }
  throw new Error("PDF 다운로드 리디렉션이 너무 많습니다.");
}

function kciArticleIdFromUrl(url) {
  const match = url.match(/(?:arti_id|artiId)=([^&#'"\s]+)/i);
  return match ? decodeURIComponent(match[1]) : "";
}

function kciUrlFromDbpiaPage(html) {
  // DBpia는 KCI 원문을 외부 뷰어 링크로 렌더링한다. HTML 속성과
  // onClickExternalLinkNode 호출 양쪽을 허용해 마크업 변경에 대응한다.
  const urls = html.match(/https?:\/\/(?:www\.)?kci\.go\.kr[^'"\s<]+/gi) || [];
  const url = urls.find((candidate) => /(?:arti_id|artiId)=ART\d+/i.test(candidate));
  return url ? url.replace(/&amp;/g, "&") : "";
}

function normalizeTitle(title) {
  // 표기 차이(공백·따옴표·괄호·부제 구분자)를 제거해 같은 논문인지만 본다.
  return (title || "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .toLowerCase()
    .replace(/[\s ]+/g, "")
    .replace(/[‘’“”'"()（）［］\[\]{}<>《》〈〉:：;；,，.·・‧\-–—_/\\]/g, "");
}

// KCI 검색은 부분일치라서 전혀 다른 논문이 1위로 올라온다. 제목이 실제로
// 일치할 때만 그 논문을 원문으로 인정한다.
function titlesMatch(dbpiaTitle, kciTitle) {
  const source = normalizeTitle(dbpiaTitle);
  const target = normalizeTitle(kciTitle);
  if (source.length < 8 || target.length < 8) return false;
  // KCI 제목에는 DBpia가 생략한 부제가 붙는 경우가 있다.
  return target === source || target.startsWith(source) || source.startsWith(target);
}

function getCitationTitle(html) {
  const match = html.match(/<meta\s+name="citation_title"\s+content="([^"]*)"/i);
  return (match?.[1] || "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function getCitationPageCount(html) {
  const firstPage = Number(html.match(/<meta\s+name="citation_firstpage"\s+content="(\d+)"/i)?.[1]);
  const lastPage = Number(html.match(/<meta\s+name="citation_lastpage"\s+content="(\d+)"/i)?.[1]);
  return Number.isFinite(firstPage) && Number.isFinite(lastPage) && lastPage >= firstPage
    ? lastPage - firstPage + 1
    : 0;
}

async function kciRequest(url, options = {}) {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ...(options.headers || {}),
  };
  const hostname = new URL(url).hostname;
  if (kciSessionCookie && (hostname === "kci.go.kr" || hostname.endsWith(".kci.go.kr"))) {
    headers.Cookie = kciSessionCookie;
  }
  const res = await fetch(url, { ...options, headers, redirect: "manual" });
  const setCookies = res.headers.getSetCookie?.() || [];
  if (setCookies.length && (hostname === "kci.go.kr" || hostname.endsWith(".kci.go.kr"))) {
    const existing = parseCookies(kciSessionCookie);
    for (const setCookie of setCookies) {
      const [keyValue] = setCookie.split(";");
      const equalsIndex = keyValue.indexOf("=");
      if (equalsIndex > 0) existing[keyValue.substring(0, equalsIndex).trim()] = keyValue.substring(equalsIndex + 1).trim();
    }
    kciSessionCookie = Object.entries(existing).map(([key, value]) => `${key}=${value}`).join("; ");
  }
  return res;
}

async function fetchKciDownload(url, referer) {
  let currentUrl = url;
  for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
    const res = await kciRequest(currentUrl, { headers: referer ? { Referer: referer } : {} });
    if (![301, 302, 303, 307, 308].includes(res.status)) return res;
    const location = res.headers.get("location");
    if (!location) throw new Error("KCI PDF 다운로드 리디렉션 주소가 없습니다.");
    currentUrl = new URL(location, currentUrl).toString();
  }
  throw new Error("KCI PDF 다운로드 리디렉션이 너무 많습니다.");
}

async function findKciArticleId(title) {
  await kciRequest(`${KCI_BASE_URL}/kciportal/landing/articleSearch.kci`);
  const res = await kciRequest(`${KCI_BASE_URL}/kciportal/landing/articleList.kci`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      "landingSearchBean.conditionList": "INDE_TITL",
      "landingSearchBean.keywordList": title,
    }).toString(),
  });
  if (!res.ok) throw new Error(`KCI 논문 검색 실패 (${res.status})`);
  const html = await res.text();
  const match = html.match(/\/landing\/article\.kci\?arti_id=(ART\d+)/i);
  return match?.[1] || "";
}

async function downloadKciPdf(nodeId, outputDir, articleId, expectedPages = 0, expectedTitle = "") {
  if (!articleId) throw new Error("KCI 논문 식별자(ART...)를 찾을 수 없습니다.");
  const landingUrl = `${KCI_BASE_URL}/kciportal/landing/article.kci?arti_id=${encodeURIComponent(articleId)}`;
  const landingRes = await kciRequest(landingUrl);
  if (!landingRes.ok) throw new Error(`KCI 논문 상세 요청 실패 (${landingRes.status})`);
  const landingHtml = await landingRes.text();
  // 잘못된 논문의 원문을 받아 저장하는 일이 없도록 제목을 대조한다.
  const kciTitle = getCitationTitle(landingHtml);
  if (!titlesMatch(expectedTitle, kciTitle)) {
    throw new Error(
      `KCI에서 찾은 논문(${articleId}: ${kciTitle || "제목 확인 불가"})이 요청한 논문과 일치하지 않습니다.`
    );
  }
  // KCI가 실제 원문을 제공할 때에만 페이지에 fncDown(ART..., KCI_FI...)가 있다.
  // 다른 PDF 링크(서지정보 안내문 등)는 원문으로 취급하지 않는다.
  const downloadMatch = landingHtml.match(/fncDown\(\s*['"](ART\d+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/i);
  if (!downloadMatch) {
    throw new Error("KCI에서 이 논문의 공개 원문 PDF를 제공하지 않습니다.");
  }
  const downloadUrl = `${KCI_BASE_URL}/kciportal/ci/sereArticleSearch/ciSereArtiOrteServHistIFrame.kci?${new URLSearchParams({
    "sereArticleSearchBean.artiId": downloadMatch[1],
    "sereArticleSearchBean.orteFileId": downloadMatch[2],
  })}`;
  let lastError;
  // KCI는 간헐적으로 Content-Length보다 짧은 응답을 종료한다. 손상된
  // PDF를 저장하지 않고 새 요청으로 재시도한다.
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const pdfRes = await fetchKciDownload(downloadUrl, landingUrl);
      if (!pdfRes.ok) throw new Error(`KCI PDF 파일 요청 실패 (${pdfRes.status})`);
      const buffer = Buffer.from(await pdfRes.arrayBuffer());
      assertCompletePdfResponse(pdfRes, buffer);
      assertKciOriginalPdf(buffer, expectedPages);
      return savePdf(nodeId, outputDir, pdfRes, buffer, "KCI");
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`KCI 원문 PDF를 완전하게 받지 못했습니다 (3회 시도): ${lastError.message}`);
}

async function savePdf(nodeId, outputDir, pdfRes, buffer, source) {
  const targetDir = path.resolve(outputDir || process.env.DBPIA_DOWNLOAD_DIR || path.join(process.cwd(), "downloads"));
  await mkdir(targetDir, { recursive: true });
  const filePath = path.join(targetDir, fileNameForNode(nodeId, pdfRes.headers.get("content-disposition")));
  await writeFile(filePath, buffer);
  return { filePath, bytes: buffer.length, source };
}

async function downloadDbpiaPdf(nodeId, outputDir) {
  const authRes = await request("/download/check-auth", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `nodeId=${encodeURIComponent(nodeId)}`,
  });
  if (!authRes.ok) throw new Error(`원문 권한 확인 실패 (${authRes.status})`);
  const authData = await authRes.json();
  if (authData.b2bLoginYN !== "Y") {
    throw new Error("기관 인증이 필요하거나 이 논문에 대한 접근 권한이 없습니다.");
  }

  // DBpia 웹 뷰어의 '원본 다운받기'와 동일한 API를 사용한다. 이 엔드포인트는
  // form-urlencoded만 처리하며, JSON 본문을 보내면 200 OK에 빈 link를 돌려준다.
  const linkRes = await request("/download/downloadData", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Referer: `${BASE_URL}/pdf/pdfView.do?nodeId=${encodeURIComponent(nodeId)}`,
      "X-Referer": `${BASE_URL}/journal/articleDetail?nodeId=${encodeURIComponent(nodeId)}`,
    },
    body: new URLSearchParams({ nodeId, depth: "Article", shape: "download" }).toString(),
  });
  if (!linkRes.ok) throw new Error(`PDF 다운로드 요청 실패 (${linkRes.status})`);
  const linkData = await linkRes.json();
  if (!linkData.link) {
    if (linkData.isNotDownloadPlct === "true") {
      throw new Error("발행기관 정책상 이 논문은 다운로드할 수 없습니다.");
    }
    throw new Error(linkData.msg || "이 논문은 다운로드 권한이 없거나 DBpia가 다운로드 링크를 제공하지 않았습니다.");
  }

  const pdfRes = await fetchDownload(linkData.link);
  if (!pdfRes.ok) throw new Error(`PDF 파일 요청 실패 (${pdfRes.status})`);
  const buffer = Buffer.from(await pdfRes.arrayBuffer());
  if (!isPdfResponse(pdfRes, buffer)) {
    // 원문이 없는 레코드(도서 DB, 외부 링크 등)는 PDF 대신 안내 HTML을 준다.
    throw new Error("DBpia가 PDF 파일 대신 다른 응답을 반환했습니다.");
  }
  return savePdf(nodeId, outputDir, pdfRes, buffer, "DBpia");
}

async function downloadPdf(nodeId, outputDir) {
  assertNodeId(nodeId);
  await ensureLogin();

  const detailRes = await request(`/journal/articleDetail?nodeId=${encodeURIComponent(nodeId)}`);
  if (!detailRes.ok) throw new Error(`논문 상세 정보 요청 실패 (${detailRes.status})`);
  const detailHtml = await detailRes.text();
  const title = getCitationTitle(detailHtml);
  const expectedPages = getCitationPageCount(detailHtml);
  const linkedKciId = kciArticleIdFromUrl(kciUrlFromDbpiaPage(detailHtml));
  const failures = [];

  // DBpia가 KCI를 원문 제공처로 지정한 논문은 KCI의 공개 원문을 먼저 받는다.
  if (linkedKciId) {
    try {
      return await downloadKciPdf(nodeId, outputDir, linkedKciId, expectedPages, title);
    } catch (error) {
      failures.push(`KCI: ${error.message}`);
    }
  }

  try {
    return await downloadDbpiaPdf(nodeId, outputDir);
  } catch (error) {
    failures.push(`DBpia: ${error.message}`);
  }

  // 일부 구형 레코드는 KCI 등재 표기·외부 링크 없이 PDF 뷰어만 제공한다.
  // 마지막 수단으로 제목 검색을 쓰되, downloadKciPdf가 제목을 대조해
  // 다른 논문이면 저장하지 않는다.
  if (!linkedKciId) {
    try {
      const searchedKciId = await findKciArticleId(title);
      if (searchedKciId) {
        return await downloadKciPdf(nodeId, outputDir, searchedKciId, expectedPages, title);
      }
    } catch (error) {
      failures.push(`KCI: ${error.message}`);
    }
  }

  throw new Error(failures.join(" / ") || "원문 PDF를 제공하는 경로를 찾지 못했습니다.");
}

function parseCookies(cookieStr) {
  const map = {};
  if (!cookieStr) return map;
  for (const part of cookieStr.split("; ")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx > 0) {
      map[part.substring(0, eqIdx)] = part.substring(eqIdx + 1);
    }
  }
  return map;
}

async function isSessionAlive() {
  try {
    const res = await request("/member/me");
    if (!res.ok) return false;
    const me = await res.json();
    return Boolean(me.b2bId || me.b2bName);
  } catch {
    return false;
  }
}

async function ensureLogin() {
  if (loggedIn) {
    // 서버가 오래 떠 있으면 DBpia 세션이 먼저 만료된다. 만료된 쿠키를 계속
    // 들고 있으면 이후 모든 요청이 조용히 실패하므로 주기적으로 확인한다.
    if (Date.now() - lastLoginCheck < LOGIN_RECHECK_MS) return;
    if (await isSessionAlive()) {
      lastLoginCheck = Date.now();
      return;
    }
    loggedIn = false;
    sessionCookie = "";
  }

  if (!B2B_ACC || !B2B_PASS) {
    throw new Error(
      "DBPIA_B2B_ACC와 DBPIA_B2B_PASS 환경변수를 설정해주세요."
    );
  }
  if (!B2B_ID) {
    throw new Error(
      "DBPIA_B2B_ID 환경변수를 설정해주세요. (기관 검색은 search_institution 도구를 사용하세요)"
    );
  }

  await request("/member/b2bLogin");

  const body = new URLSearchParams({
    b2bAcc: B2B_ACC,
    userPass: B2B_PASS,
    b2bLoginType: "151004",
    b2bId: B2B_ID,
    b2bName: B2B_NAME,
    reAuth: "",
  });

  const res = await request("/member/b2bLoginProc", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = await res.json();

  if (data.loginSucYN !== "Y") {
    throw new Error(`로그인 실패: ${data.loginMsg || "알 수 없는 오류"}`);
  }

  await request("/search/topSearch?searchOption=all&query=init");

  loggedIn = true;
  lastLoginCheck = Date.now();
}

async function searchArticles(query, page = 1, pageSize = 20, sort = "RANK") {
  page = Math.max(1, Math.trunc(page) || 1);
  pageSize = Math.min(50, Math.max(1, Math.trunc(pageSize) || 20));
  const res = await request("/api/search/list", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Referer: `${BASE_URL}/search/topSearch?searchOption=all&query=${encodeURIComponent(query)}`,
    },
    body: JSON.stringify({
      query,
      page,
      pageSize,
      subjectCodes: [],
      pbshYears: [],
      plctNames: [],
      dataTypes: [],
      publicationInfos: [],
      sort,
      collection: "ALL",
      includeAr: false,
      collectionQuery: [],
      collectionQueryStr: "",
      filter: [],
      prefix: [],
      realQuery: "",
      startDate: "1970.01.01",
      endDate: "",
      originText: false,
      subjectCategory: "",
    }),
  });
  return await res.json();
}

function cleanHighlight(text) {
  return (text || "").replace(/<!HS>/g, "").replace(/<!HE>/g, "");
}

function formatSearchResults(data) {
  if (!data.list || data.list.length === 0) {
    return "검색 결과가 없습니다.";
  }

  const lines = [];
  const total = data.pageInfo?.totalCount || "?";
  lines.push(`총 ${total}건 중 ${data.list.length}건 표시\n`);

  for (const item of data.list) {
    lines.push(`## ${cleanHighlight(item.nodeTitle)}`);
    lines.push(`- **Node ID**: ${item.nodeId}`);
    lines.push(
      `- **저자**: ${item.authors?.map((a) => a.autrNm).join(", ") || "정보 없음"}`
    );
    lines.push(`- **학술지**: ${cleanHighlight(item.plctNm || "")}`);
    lines.push(`- **발행일**: ${item.publishYymm || ""}`);
    lines.push(`- **분류**: ${cleanHighlight(item.subjectCodeName || "")}`);
    lines.push(`- **조회수**: ${item.useCnt || 0}`);
    if (item.abstractText) {
      lines.push(
        `- **초록**: ${cleanHighlight(item.abstractText).substring(0, 300)}...`
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function getArticleDetail(nodeId) {
  assertLookupNodeId(nodeId);
  const res = await request(`/journal/articleDetail?nodeId=${encodeURIComponent(nodeId)}`);
  if (!res.ok) throw new Error(`논문 상세 정보 요청 실패 (${res.status})`);
  const html = await res.text();

  const metas = {};
  const metaRegex =
    /<meta\s+name="citation_([^"]+)"\s+content="([^"]*)"\s*\/?>/g;
  let match;
  while ((match = metaRegex.exec(html)) !== null) {
    const key = match[1];
    const value = match[2];
    if (key === "author") {
      if (!metas.authors) metas.authors = [];
      metas.authors.push(value);
    } else if (key === "keywords") {
      metas.keywords = value;
    } else {
      metas[key] = value;
    }
  }

  const ogDescMatch = html.match(
    /<meta\s+(?:property|name)="(?:og:description|description)"\s+content="([^"]*)"/
  );
  if (ogDescMatch) {
    metas.description = ogDescMatch[1];
  }

  const abstractMatch = html.match(
    /<meta\s+name="citation_abstract"\s+content="([\s\S]*?)"\s*\/?>/
  );
  if (abstractMatch) {
    metas.abstract = abstractMatch[1];
  }

  // 존재하지 않는 nodeId에도 DBpia는 200과 빈 페이지를 돌려준다. 이를
  // 성공으로 보고하면 '제목 없음' 결과가 정상 조회처럼 보인다.
  if (!metas.title) {
    throw new Error(`해당 Node ID의 논문 정보를 찾을 수 없습니다 (${nodeId}).`);
  }

  return metas;
}

function formatArticleDetail(metas) {
  const lines = [];
  lines.push(`# ${metas.title || "제목 없음"}`);
  lines.push("");
  if (metas.authors?.length) {
    lines.push(`**저자**: ${metas.authors.join(", ")}`);
  }
  if (metas.journal_title) {
    lines.push(`**학술지**: ${metas.journal_title}`);
  }
  if (metas.publication_date) {
    lines.push(`**발행일**: ${metas.publication_date}`);
  }
  if (metas.volume) lines.push(`**권**: ${metas.volume}`);
  if (metas.issue) lines.push(`**호**: ${metas.issue}`);
  if (metas.firstpage || metas.lastpage) {
    lines.push(`**페이지**: ${metas.firstpage || ""}–${metas.lastpage || ""}`);
  }
  if (metas.doi) lines.push(`**DOI**: ${metas.doi}`);
  if (metas.issn) lines.push(`**ISSN**: ${metas.issn}`);
  if (metas.keywords) lines.push(`**키워드**: ${metas.keywords}`);
  if (metas.abstract_html_url) {
    lines.push(`**URL**: ${metas.abstract_html_url}`);
  }
  lines.push("");
  if (metas.abstract) {
    lines.push("## 초록");
    lines.push(metas.abstract);
  } else if (metas.description) {
    lines.push("## 설명");
    lines.push(metas.description);
  }
  return lines.join("\n");
}

const server = new McpServer({
  name: "dbpia",
  version: "1.0.0",
});

server.tool(
  "search",
  "DBPia에서 논문을 검색합니다.",
  {
    query: z.string().describe("검색 키워드"),
    page: z.number().optional().default(1).describe("페이지 번호 (기본: 1)"),
    pageSize: z
      .number()
      .optional()
      .default(20)
      .describe("페이지당 결과 수 (기본: 20, 최대: 50)"),
    sort: z
      .enum(["RANK", "DATE", "CITE"])
      .optional()
      .default("RANK")
      .describe("정렬 기준: RANK(관련도), DATE(최신순), CITE(인용순)"),
  },
  async ({ query, page, pageSize, sort }) => {
    try {
      await ensureLogin();
      const data = await searchArticles(query, page, pageSize, sort);
      return { content: [{ type: "text", text: formatSearchResults(data) }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `오류: ${e.message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_article",
  "논문의 상세 정보를 가져옵니다 (제목, 저자, 초록, 키워드 등).",
  {
    nodeId: z
      .string()
      .describe(
        "논문 Node ID (예: NODE11462877). 검색 결과에서 확인 가능."
      ),
  },
  async ({ nodeId }) => {
    try {
      await ensureLogin();
      const metas = await getArticleDetail(nodeId);
      return {
        content: [{ type: "text", text: formatArticleDetail(metas) }],
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: `오류: ${e.message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "search_institution",
  "DBPia 기관(학교) 검색. DBPIA_B2B_ID 설정 전에 기관 ID를 조회할 때 사용.",
  {
    keyword: z.string().describe("기관명 검색 키워드 (예: 대전대신고등학교)"),
  },
  async ({ keyword }) => {
    try {
      await request("/member/b2bLogin");
      const res = await request("/member/getB2bList", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `keyword=${encodeURIComponent(keyword)}`,
      });
      const list = await res.json();
      if (!list.length) {
        return { content: [{ type: "text", text: "검색 결과가 없습니다." }] };
      }
      const lines = list.map(
        (item) => `- **${item.b2b_name}** (ID: ${item.b2b_id})`
      );
      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `오류: ${e.message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_fulltext",
  "논문의 원문 접근 정보를 가져옵니다. 기관 인증이 필요합니다.",
  {
    nodeId: z.string().describe("논문 Node ID"),
  },
  async ({ nodeId }) => {
    try {
      await ensureLogin();

      assertLookupNodeId(nodeId);
      const authRes = await request("/download/check-auth", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `nodeId=${encodeURIComponent(nodeId)}`,
      });
      if (!authRes.ok) throw new Error(`원문 권한 확인 실패 (${authRes.status})`);
      const authData = await authRes.json();

      const articleMetas = await getArticleDetail(nodeId);
      const detail = formatArticleDetail(articleMetas);

      let result = detail;
      result += "\n\n## 원문 접근 정보\n";
      result += `- 기관 인증: ${authData.b2bLoginYN === "Y" ? "인증됨" : "미인증"}\n`;
      result += `- 열람 링크: ${BASE_URL}/journal/articleDetail?nodeId=${encodeURIComponent(nodeId)}`;

      return { content: [{ type: "text", text: result }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `오류: ${e.message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "download_pdf",
  "DBpia 논문 PDF를 로컬 폴더에 저장합니다. KCI 제공 논문은 KCI의 공개 원문을 내려받습니다.",
  {
    nodeId: z.string().describe("논문 Node ID"),
    outputDir: z
      .string()
      .optional()
      .describe("PDF를 저장할 절대 또는 상대 폴더 경로 (기본: MCP 서버의 downloads 폴더)"),
  },
  async ({ nodeId, outputDir }) => {
    try {
      const { filePath, bytes, source } = await downloadPdf(nodeId, outputDir);
      return {
        content: [
          {
            type: "text",
            text: `PDF를 저장했습니다.\n- 제공처: ${source}\n- 파일: ${filePath}\n- 크기: ${bytes.toLocaleString()} bytes`,
          },
        ],
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: `PDF 다운로드 오류: ${e.message}` }],
        isError: true,
      };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
