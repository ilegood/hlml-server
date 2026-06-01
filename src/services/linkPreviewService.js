import dns from "dns/promises";
import net from "net";

const LINK_PREVIEW_TIMEOUT_MS = 3500;
const LINK_PREVIEW_MAX_BYTES = 300000;
const LINK_PREVIEW_MAX_REDIRECTS = 4;
const LINK_PREVIEW_SUCCESS_TTL_MS = 1000 * 60 * 30;
const LINK_PREVIEW_FAILURE_TTL_MS = 1000 * 60 * 3;

const linkPreviewCache = new Map();

const LINK_PREVIEW_ALLOWED_HOSTS = [
  "naver.me",
  "map.naver.com",
  "map.kakao.com",
  "place.map.kakao.com",
  "m.map.kakao.com",
  "maps.google.com",
  "google.com",
  "google.co.kr",
  "maps.app.goo.gl",
  "goo.gl",
  "blog.naver.com",
  "m.blog.naver.com",
  "cafe.naver.com",
  "m.cafe.naver.com",
  "youtube.com",
  "youtube-nocookie.com",
  "youtu.be",
];

const isAllowedPreviewHost = (hostname) =>
  LINK_PREVIEW_ALLOWED_HOSTS.some(
    (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`),
  );

const isAllowedPreviewUrl = (url) => {
  const hostname = url.hostname.toLowerCase();
  const path = url.pathname;
  if (!isAllowedPreviewHost(hostname)) return false;
  if (hostname === "goo.gl") return path.startsWith("/maps");
  if (hostname === "google.com" || hostname.endsWith(".google.com")) {
    return path.startsWith("/maps") || hostname === "maps.google.com";
  }
  if (hostname === "google.co.kr" || hostname.endsWith(".google.co.kr")) {
    return path.startsWith("/maps") || hostname === "maps.google.co.kr";
  }
  return true;
};

const isPrivateIp = (address) => {
  const version = net.isIP(address);
  if (version === 4) {
    const parts = address.split(".").map((part) => Number(part));
    const [a, b] = parts;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }

  if (version === 6) {
    const normalized = address.toLowerCase();
    return (
      normalized === "::1" ||
      normalized === "::" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:")
    );
  }

  return true;
};

const httpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const assertPreviewUrlAllowed = async (url) => {
  if (!["http:", "https:"].includes(url.protocol)) {
    throw httpError(400, "invalid preview url");
  }

  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    !isAllowedPreviewUrl(url)
  ) {
    throw httpError(400, "preview host not allowed");
  }

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw httpError(400, "preview host not allowed");
    return;
  }

  const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  if (
    addresses.length === 0 ||
    addresses.some((entry) => isPrivateIp(entry.address))
  ) {
    throw httpError(400, "preview host not allowed");
  }
};

export const normalizePreviewUrl = (value) => {
  const parsed = new URL(
    String(value || "").match(/^https?:\/\//i) ? value : `https://${value}`,
  );
  parsed.hash = "";
  if (parsed.username || parsed.password) {
    throw httpError(400, "invalid preview url");
  }
  return parsed;
};

const decodeHtmlEntities = (value = "") =>
  String(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();

const getMetaContent = (html, property) => {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
      "i",
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtmlEntities(match[1]);
  }
  return "";
};

const getHtmlTitle = (html) => {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1] ? decodeHtmlEntities(match[1].replace(/\s+/g, " ")) : "";
};

const getFaviconUrl = (html, baseUrl) => {
  const match = html.match(
    /<link[^>]+rel=["'][^"']*(?:icon|shortcut icon)[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>/i,
  );
  if (!match?.[1]) return "";
  try {
    return new URL(decodeHtmlEntities(match[1]), baseUrl).toString();
  } catch {
    return "";
  }
};

const getDefaultPreviewTitle = (url) => {
  const hostname = url.hostname.toLowerCase();
  if (hostname.includes("kakao.com")) return "Kakao Map";
  if (hostname.includes("google.")) return "Google Maps";
  if (hostname.includes("naver.")) return "Naver";
  if (hostname.includes("youtube.") || hostname === "youtu.be") return "YouTube";
  return hostname.replace(/^www\./, "");
};

const GENERIC_PREVIEW_TITLES = new Set([
  "",
  "kakao map",
  "카카오맵",
  "네이버 지도",
  "naver map",
  "google maps",
  "google map",
]);

const isGenericPreviewTitle = (value = "") => {
  const title = decodeHtmlEntities(value).replace(/\s+/g, " ").trim();
  return GENERIC_PREVIEW_TITLES.has(title.toLowerCase());
};

const getUrlParamValue = (url, keys) => {
  for (const key of keys) {
    const value = url.searchParams.get(key);
    if (value) return decodeURIComponent(value).replace(/\+/g, " ").trim();
  }
  return "";
};

const getTitleFromPath = (url) => {
  const parts = url.pathname
    .split("/")
    .map((part) => decodeURIComponent(part.replace(/\+/g, " ")).trim())
    .filter(Boolean);
  const useful = parts
    .filter((part) => !/^\d+$/.test(part))
    .filter((part) => !["place", "maps", "map", "search"].includes(part.toLowerCase()));
  return useful.at(-1) || "";
};

const extractTitleFromUrl = (url) => {
  const hostname = url.hostname.toLowerCase();
  if (hostname.includes("kakao.com")) {
    return getUrlParamValue(url, ["q", "query", "keyword", "name"]) || getTitleFromPath(url);
  }
  if (hostname.includes("google.")) {
    return getUrlParamValue(url, ["q", "query"]) || getTitleFromPath(url);
  }
  if (hostname.includes("naver.")) {
    return getUrlParamValue(url, ["query", "q", "title"]) || getTitleFromPath(url);
  }
  return getUrlParamValue(url, ["q", "query", "title"]) || getTitleFromPath(url);
};

const getPreviewTitle = (html, url) => {
  const hostname = url.hostname.toLowerCase();
  const metaTitle =
    getMetaContent(html, "og:title") ||
    getMetaContent(html, "twitter:title") ||
    getHtmlTitle(html);
  const urlTitle = extractTitleFromUrl(url);

  const isMapHost =
    hostname.includes("kakao.com") ||
    hostname.includes("google.") ||
    hostname.includes("naver.");
  if (isMapHost && urlTitle) return urlTitle;
  if (!isGenericPreviewTitle(metaTitle)) return metaTitle;
  return urlTitle || getDefaultPreviewTitle(url);
};

const getPreviewDescription = (html) =>
  getMetaContent(html, "og:description") ||
  getMetaContent(html, "description") ||
  getMetaContent(html, "twitter:description");

const readResponseBodyWithLimit = async (response) => {
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > LINK_PREVIEW_MAX_BYTES) {
      throw httpError(413, "preview response too large");
    }
    chunks.push(value);
  }

  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return buffer;
};

const fetchPreviewHtml = async (initialUrl) => {
  let currentUrl = initialUrl;

  for (let redirects = 0; redirects <= LINK_PREVIEW_MAX_REDIRECTS; redirects++) {
    await assertPreviewUrlAllowed(currentUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LINK_PREVIEW_TIMEOUT_MS);

    try {
      const response = await fetch(currentUrl, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "user-agent":
            "Mozilla/5.0 (compatible; HLMLBot/1.0; +https://hlml.example)",
          accept: "text/html,application/xhtml+xml",
        },
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) throw httpError(502, "preview redirect missing location");
        currentUrl = new URL(location, currentUrl);
        continue;
      }

      if (!response.ok) throw httpError(502, "preview fetch failed");
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("text/html")) {
        throw httpError(415, "preview content type not supported");
      }

      const buffer = await readResponseBodyWithLimit(response);
      return {
        html: decodeHtmlBuffer(buffer, contentType),
        finalUrl: currentUrl,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  throw httpError(508, "too many preview redirects");
};

const normalizeCharset = (value = "") => {
  const charset = String(value).toLowerCase().replace(/["']/g, "").trim();
  if (["ks_c_5601-1987", "euc-kr", "cp949", "x-windows-949"].includes(charset)) {
    return "euc-kr";
  }
  return charset;
};

const getCharsetFromContentType = (contentType = "") => {
  const match = String(contentType).match(/charset\s*=\s*([^;\s]+)/i);
  return match?.[1] ? normalizeCharset(match[1]) : "";
};

const getCharsetFromHtml = (html = "") => {
  const metaCharset = html.match(/<meta[^>]+charset=["']?\s*([^"'\s/>]+)/i);
  if (metaCharset?.[1]) return normalizeCharset(metaCharset[1]);

  const contentType = html.match(
    /<meta[^>]+http-equiv=["']content-type["'][^>]+content=["'][^"']*charset=([^"';\s]+)/i,
  );
  return contentType?.[1] ? normalizeCharset(contentType[1]) : "";
};

const decodeHtmlBuffer = (buffer, contentType) => {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const headerCharset = getCharsetFromContentType(contentType);
  const sniffedHtml = new TextDecoder("utf-8").decode(bytes.slice(0, 4096));
  const htmlCharset = getCharsetFromHtml(sniffedHtml);
  const charset = headerCharset || htmlCharset || "utf-8";

  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
};

export const getLinkPreview = async (rawUrl) => {
  const parsedUrl = normalizePreviewUrl(rawUrl);
  const cacheKey = parsedUrl.toString();
  const cached = linkPreviewCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return { status: cached.status, body: cached.body };
  }

  const { html, finalUrl } = await fetchPreviewHtml(parsedUrl);
  const finalCacheKey = normalizePreviewUrl(finalUrl.toString()).toString();
  const title = getPreviewTitle(html, finalUrl);
  const description = getPreviewDescription(html);
  const hostname = finalUrl.hostname.toLowerCase();
  const siteName = getMetaContent(html, "og:site_name") || hostname;
  const body = {
    url: finalUrl.toString(),
    title,
    subtitle: description || siteName,
    description,
    image:
      getMetaContent(html, "og:image") ||
      getMetaContent(html, "twitter:image") ||
      getFaviconUrl(html, finalUrl),
    siteName,
    domain: hostname,
  };

  linkPreviewCache.set(cacheKey, {
    status: 200,
    body,
    expiresAt: Date.now() + LINK_PREVIEW_SUCCESS_TTL_MS,
  });
  linkPreviewCache.set(finalCacheKey, {
    status: 200,
    body,
    expiresAt: Date.now() + LINK_PREVIEW_SUCCESS_TTL_MS,
  });

  return { status: 200, body };
};

export const cacheLinkPreviewFailure = (rawUrl, status, body) => {
  try {
    const cacheKey = normalizePreviewUrl(rawUrl).toString();
    linkPreviewCache.set(cacheKey, {
      status,
      body,
      expiresAt: Date.now() + LINK_PREVIEW_FAILURE_TTL_MS,
    });
  } catch {
    // Invalid URLs are not cacheable.
  }
};
