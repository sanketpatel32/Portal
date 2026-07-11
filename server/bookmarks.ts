import { BookmarkModel } from "./db";
import type { CreateBookmarkInput, UpdateBookmarkInput, BookmarkListQuery } from "../shared/validation/bookmark";

export type BookmarkListItem = {
  id: string;
  url: string;
  title: string;
  tag: string;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
};

/**
 * Best-effort fetch of a page's <title>. Never throws — on any failure it falls
 * back to the URL host so callers can always present *something* useful.
 */
export async function fetchTitleFromUrl(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; AuraFlowBookmark/1.0; +https://localhost)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return hostnameFromUrl(url);
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("xml")) {
      return hostnameFromUrl(url);
    }

    // Only read the head of the document — titles live near the top and big
    // pages would otherwise blow through memory unnecessarily.
    const reader = res.body?.getReader();
    if (!reader) {
      return hostnameFromUrl(url);
    }

    let html = "";
    const decoder = new TextDecoder();
    const MAX_BYTES = 64 * 1024;
    let read = 0;
    while (read < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      read += value.byteLength;
      if (/<\/title>/i.test(html)) break;
    }

    const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = match?.[1]?.trim();
    return title && title.length > 0 ? title.slice(0, 200) : hostnameFromUrl(url);
  } catch {
    return hostnameFromUrl(url);
  }
}

function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export async function listBookmarks(query: BookmarkListQuery): Promise<BookmarkListItem[]> {
  const filter: Record<string, unknown> = {};

  if (query.favorite) {
    filter.favorite = true;
  }

  if (query.tag) {
    filter.tag = query.tag;
  }

  if (query.q) {
    const escaped = query.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { title: { $regex: escaped, $options: "i" } },
      { url: { $regex: escaped, $options: "i" } },
    ];
  }

  const docs = await BookmarkModel.find(filter).sort({ favorite: -1, createdAt: -1 });
  return docs.map((doc) => doc.toJSON() as BookmarkListItem);
}

export async function createBookmark(input: CreateBookmarkInput): Promise<BookmarkListItem> {
  const title = input.title && input.title.trim().length > 0
    ? input.title
    : await fetchTitleFromUrl(input.url);

  const doc = await BookmarkModel.create({
    url: input.url,
    title,
    tag: input.tag,
    favorite: input.favorite,
  });

  return doc.toJSON() as BookmarkListItem;
}

export async function updateBookmark(id: string, input: UpdateBookmarkInput): Promise<BookmarkListItem> {
  const doc = await BookmarkModel.findById(id);
  if (!doc) {
    throw new Error("Bookmark not found");
  }

  if (input.url !== undefined) doc.url = input.url;
  if (input.title !== undefined) {
    doc.title = input.title.trim().length > 0 ? input.title : doc.title;
  }
  if (input.tag !== undefined) doc.tag = input.tag;
  if (input.favorite !== undefined) doc.favorite = input.favorite;

  await doc.save();
  return doc.toJSON() as BookmarkListItem;
}

export async function deleteBookmark(id: string): Promise<{ id: string }> {
  const doc = await BookmarkModel.findById(id);
  if (!doc) {
    throw new Error("Bookmark not found");
  }
  await BookmarkModel.findByIdAndDelete(id);
  return { id };
}
