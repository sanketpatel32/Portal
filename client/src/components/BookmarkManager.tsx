import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Bookmark as BookmarkIcon,
  Pencil,
  Star,
  Trash2,
  Plus,
  Search,
  ExternalLink,
  X,
} from "lucide-react";
import { env } from "@/env";
import { usePersistentState } from "@/hooks/usePersistentState";
import { useAuthHeaders } from "@/hooks/useAuthHeaders";
import { useApiData } from "@/hooks/useApiData";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { parseApiError } from "@/lib/parse-api-error";
import { validateInput } from "@/lib/form-validation";
import {
  BOOKMARK_TAGS,
  createBookmarkSchema,
  updateBookmarkSchema,
} from "@shared/validation/bookmark";
import { cn } from "@/lib/utils";
import {
  interactiveCardClass,
  panelClass,
  toolMainClass,
  toolScrollClass,
} from "@/lib/ui-classes";
import { ModuleShell } from "./ui/ModuleShell";
import { ModuleHeaderBar } from "./ui/ModuleHeaderBar";
import { AppButton } from "./ui/AppButton";
import { AppInput } from "./ui/AppInput";
import { SearchableSelect } from "./ui/SearchableSelect";
import { LoadingSpinner } from "./ui/LoadingSpinner";
import { EmptyState } from "./ui/EmptyState";
import { ErrorBanner } from "./ui/ErrorBanner";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { SectionHeader } from "./ui/SectionHeader";

type Bookmark = {
  id: string;
  url: string;
  title: string;
  tag: string;
  favorite: boolean;
  createdAt: string;
};

type Props = {
  token: string;
  onBack: () => void;
  playBeep: (type: "success" | "error" | "click") => void;
};

const TAG_OPTIONS = BOOKMARK_TAGS;

export const BookmarkManager: React.FC<Props> = ({ token, onBack, playBeep: beep }) => {
  const apiHeaders = useAuthHeaders(token);

  // Filter state
  const [searchInput, setSearchInput] = usePersistentState("auraflow_bookmark_searchInput", "");
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [activeTag, setActiveTag] = usePersistentState<string | null>("auraflow_bookmark_activeTag", null);
  const [favoritesOnly, setFavoritesOnly] = usePersistentState("auraflow_bookmark_favoritesOnly", false);

  // Data fetch — aborted automatically when deps change
  const { data: bookmarksData, loading, error, refetch } = useApiData<{
    bookmarks: Bookmark[];
  }>(
    useCallback(
      async (signal) => {
        const params = new URLSearchParams();
        if (debouncedSearch) params.set("q", debouncedSearch);
        if (activeTag) params.set("tag", activeTag);
        if (favoritesOnly) params.set("favorite", "true");
        const res = await fetch(`${env.VITE_API_URL}/api/bookmarks?${params}`, {
          headers: apiHeaders,
          signal,
        });
        if (!res.ok) throw new Error(await parseApiError(res));
        return res.json();
      },
      [apiHeaders, debouncedSearch, activeTag, favoritesOnly],
    ),
    [],
  );
  const bookmarks = bookmarksData?.bookmarks ?? [];
  // Optimistic favorite toggles — applied on top of fetched data for instant
  // feedback before the PUT round-trip resolves.
  const optimisticFavorites = useRef<Map<string, boolean>>(new Map());
  const [bookmarksVersion, setBookmarksVersion] = useState(0);
  const displayBookmarks = useMemo(() => {
    void bookmarksVersion; // recompute when optimistic toggles change
    if (optimisticFavorites.current.size === 0) return bookmarks;
    return bookmarks.map((b) =>
      optimisticFavorites.current.has(b.id)
        ? { ...b, favorite: optimisticFavorites.current.get(b.id)! }
        : b,
    );
  }, [bookmarks, bookmarksVersion]);

  // Inline editor state (no modal)
  const [editorOpen, setEditorOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formUrl, setFormUrl] = useState("");
  const [formTag, setFormTag] = usePersistentState<string>("auraflow_bookmark_formTag", TAG_OPTIONS[0]);
  const [formFavorite, setFormFavorite] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const urlInputRef = useRef<HTMLInputElement>(null);

  const openCreate = () => {
    setEditId(null);
    setFormUrl("");
    setFormTag(TAG_OPTIONS[0]);
    setFormFavorite(false);
    setFormError(null);
    setEditorOpen(true);
    requestAnimationFrame(() => urlInputRef.current?.focus());
  };

  const openEdit = (bookmark: Bookmark) => {
    setEditId(bookmark.id);
    setFormUrl(bookmark.url);
    setFormTag(TAG_OPTIONS.includes(bookmark.tag as typeof TAG_OPTIONS[number]) ? bookmark.tag : TAG_OPTIONS[TAG_OPTIONS.length - 1]);
    setFormFavorite(bookmark.favorite);
    setFormError(null);
    setEditorOpen(true);
    requestAnimationFrame(() => urlInputRef.current?.focus());
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const payload = {
      url: formUrl.trim(),
      tag: formTag,
      favorite: formFavorite,
    };

    const validated = validateInput(editId ? updateBookmarkSchema : createBookmarkSchema, payload);
    if (!validated.ok) {
      setFormError(validated.message);
      beep("error");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${env.VITE_API_URL}/api/bookmarks${editId ? `/${editId}` : ""}`, {
        method: editId ? "PUT" : "POST",
        headers: apiHeaders,
        body: JSON.stringify(validated.data),
      });
      if (!res.ok) {
        setFormError(await parseApiError(res));
        beep("error");
        return;
      }
      beep("success");
      closeEditor();
      await refetch();
    } catch {
      setFormError("Could not reach the server. Try again.");
      beep("error");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleFavorite = async (bookmark: Bookmark) => {
    // Optimistic update via local override map
    const newFav = !bookmark.favorite;
    optimisticFavorites.current.set(bookmark.id, newFav);
    setBookmarksVersion((v) => v + 1);
    try {
      const res = await fetch(`${env.VITE_API_URL}/api/bookmarks/${bookmark.id}`, {
        method: "PUT",
        headers: apiHeaders,
        body: JSON.stringify({ favorite: newFav }),
      });
      if (!res.ok) {
        optimisticFavorites.current.delete(bookmark.id);
        setBookmarksVersion((v) => v + 1);
        beep("error");
        return;
      }
      beep("click");
      await refetch();
      optimisticFavorites.current.delete(bookmark.id);
    } catch {
      optimisticFavorites.current.delete(bookmark.id);
      setBookmarksVersion((v) => v + 1);
    }
  };

  const [pendingDelete, setPendingDelete] = useState<Bookmark | null>(null);

  const handleDelete = async (bookmark: Bookmark) => {
    try {
      const res = await fetch(`${env.VITE_API_URL}/api/bookmarks/${bookmark.id}`, {
        method: "DELETE",
        headers: apiHeaders,
      });
      if (!res.ok) {
        setFormError(await parseApiError(res));
        beep("error");
        return;
      }
      beep("success");
      if (editId === bookmark.id) closeEditor();
      await refetch();
    } catch {
      setFormError("Could not delete the bookmark.");
      beep("error");
    }
  };

  const hasActiveFilter = debouncedSearch !== "" || activeTag !== null || favoritesOnly;
  const clearFilters = () => {
    setSearchInput("");
    setActiveTag(null);
    setFavoritesOnly(false);
  };

  return (
    <ModuleShell variant="tool" maxWidth="7xl">
      <ModuleHeaderBar
        showBack={false}
        leading={
          <>
            <div className="flex size-9 shrink-0 items-center justify-center border border-white/10 bg-white/[0.03]">
              <BookmarkIcon className="size-4 text-amber-400" strokeWidth={1.4} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-mono text-[13px] uppercase tracking-[0.22em] text-zinc-400">
                Bookmark
              </h1>
            </div>
          </>
        }
        actions={
          <AppButton variant="ghostSm" onClick={onBack} icon={<X className="size-3.5" strokeWidth={1.5} />}>
            Close
          </AppButton>
        }
      />

      {/* Inline editor panel */}
      {editorOpen && (
        <form onSubmit={handleSubmit} className={cn(panelClass, "mb-3 flex flex-col gap-2 p-3")}>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start">
            <AppInput
              ref={urlInputRef}
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={formUrl}
              onChange={(e) => setFormUrl(e.target.value)}
              placeholder="https://example.com"
              inputSize="sm"
              className="min-w-0 flex-1"
            />
            <div className="w-full lg:w-40">
              <SearchableSelect
                value={formTag}
                onValueChange={setFormTag}
                options={TAG_OPTIONS as unknown as string[]}
                placeholder="Tag"
                inputSize="sm"
              />
            </div>
          </div>

          {formError && <ErrorBanner message={formError} />}

          <div className="flex items-center justify-between">
            <label className="flex cursor-pointer items-center gap-2 select-none">
              <input
                type="checkbox"
                checked={formFavorite}
                onChange={(e) => setFormFavorite(e.target.checked)}
                className="size-3.5 accent-white"
              />
              <span className={cn(
                "flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider",
                formFavorite ? "text-white" : "text-zinc-500"
              )}>
                <Star className={cn("size-3.5", formFavorite && "fill-current")} strokeWidth={1.5} />
                Favorite
              </span>
            </label>
            <div className="flex items-center gap-2">
              <AppButton variant="ghostSm" onClick={closeEditor} disabled={submitting}>Cancel</AppButton>
              <AppButton variant="primary" type="submit" loading={submitting}>
                {editId ? "Save" : "Add"}
              </AppButton>
            </div>
          </div>
        </form>
      )}

      {/* Toolbar + list */}
      <div className={toolMainClass}>
        <SectionHeader
          title="Saved links"
          count={displayBookmarks.length}
          borderless
          className="border-b border-white/10 px-4 py-3"
          actions={
            <AppButton
              variant="ghostSm"
              onClick={() => { beep("click"); editorOpen ? closeEditor() : openCreate(); }}
              icon={<Plus className="size-3.5" strokeWidth={1.5} />}
            >
              New
            </AppButton>
          }
        />

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-600" strokeWidth={1.5} />
            <AppInput
              inputSize="sm"
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search title or url…"
              className="pl-9"
              aria-label="Search bookmarks"
            />
          </div>
          <AppButton
            variant="ghostSm"
            active={favoritesOnly}
            onClick={() => { beep("click"); setFavoritesOnly((v) => !v); }}
            icon={<Star className={cn("size-3.5", favoritesOnly && "fill-current")} strokeWidth={1.5} />}
          >
            Favorites
          </AppButton>
          {hasActiveFilter && (
            <AppButton variant="ghostSm" onClick={clearFilters}>Clear</AppButton>
          )}
        </div>

        {/* Tag filter chips */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-white/10 px-4 py-2.5">
          <span className="mr-1 font-mono text-[11px] uppercase tracking-wider text-zinc-600">Tag:</span>
          <button
            type="button"
            onClick={() => { beep("click"); setActiveTag(null); }}
            className={cn(
              "border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider transition-app motion-press",
              activeTag === null
                ? "border-white bg-white text-black"
                : "border-white/10 text-zinc-500 hover:border-white/30 hover:text-white"
            )}
          >
            All
          </button>
          {TAG_OPTIONS.map((tag) => {
            const active = activeTag === tag;
            return (
              <button
                key={tag}
                type="button"
                onClick={() => { beep("click"); setActiveTag(active ? null : tag); }}
                className={cn(
                  "border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider transition-app motion-press",
                  active
                    ? "border-white bg-white text-black"
                    : "border-white/10 text-zinc-500 hover:border-white/30 hover:text-white"
                )}
              >
                {tag}
              </button>
            );
          })}
        </div>

        <ErrorBanner message={error} onDismiss={() => refetch()} />

        {/* List */}
        {loading ? (
          <LoadingSpinner className="py-16" />
        ) : displayBookmarks.length === 0 ? (
          <EmptyState
            icon={<BookmarkIcon strokeWidth={1} />}
            message={hasActiveFilter ? "No bookmarks match your filters" : "No bookmarks saved yet"}
            description={hasActiveFilter ? "Try adjusting your search or filters." : "Save website links to keep them here."}
            action={
              hasActiveFilter ? (
                <AppButton variant="ghostSm" onClick={clearFilters}>Clear filters</AppButton>
              ) : (
                <AppButton variant="primary" onClick={openCreate} icon={<Plus className="size-3.5" strokeWidth={1.5} />}>
                  Add bookmark
                </AppButton>
              )
            }
          />
        ) : (
          <div className={cn(toolScrollClass, "grid items-start gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4")}>
            {displayBookmarks.map((bookmark) => (
              <BookmarkCard
                key={bookmark.id}
                bookmark={bookmark}
                onToggleFavorite={() => toggleFavorite(bookmark)}
                onEdit={() => openEdit(bookmark)}
                onDelete={() => setPendingDelete(bookmark)}
              />
            ))}
          </div>
        )}
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete bookmark"
        message={`Delete this bookmark?\n\n${pendingDelete?.title || pendingDelete?.url || ""}\n\nThis cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) handleDelete(pendingDelete);
          setPendingDelete(null);
        }}
      />
    </ModuleShell>
  );
};

// ── Bookmark card ──────────────────────────────────────────────

interface BookmarkCardProps {
  bookmark: Bookmark;
  onToggleFavorite: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const BookmarkCard: React.FC<BookmarkCardProps> = ({ bookmark, onToggleFavorite, onEdit, onDelete }) => {
  const hostname = useMemo(() => {
    try {
      return new URL(bookmark.url).hostname.replace(/^www\./, "");
    } catch {
      return bookmark.url;
    }
  }, [bookmark.url]);

  const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32`;

  return (
    <div className={cn(interactiveCardClass, "group p-3")}>
      <div className="flex items-start gap-2.5">
        <img
          src={faviconUrl}
          alt=""
          width={16}
          height={16}
          className="mt-0.5 size-4 shrink-0 rounded-sm object-contain"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
          }}
        />
        <div className="min-w-0 flex-1">
          <a
            href={bookmark.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate font-mono text-[13px] font-semibold tracking-wide text-white transition-colors hover:text-zinc-300"
            title={bookmark.url}
          >
            {bookmark.title || hostname}
          </a>
          <a
            href={bookmark.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate font-mono text-[11px] text-zinc-600 transition-colors hover:text-zinc-400"
            title={bookmark.url}
          >
            {hostname}
          </a>
        </div>
        <button
          type="button"
          onClick={onToggleFavorite}
          className={cn(
            "shrink-0 p-1 transition-colors",
            bookmark.favorite ? "text-white" : "text-zinc-600 hover:text-white"
          )}
          aria-label={bookmark.favorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Star className={cn("size-3.5", bookmark.favorite && "fill-current")} strokeWidth={1.5} />
        </button>
      </div>

      <div className="mt-2.5 flex items-center justify-between border-t border-white/[0.06] pt-2">
        <span className="inline-flex items-center gap-2">
          <span className="border border-white/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            {bookmark.tag}
          </span>
          <a
            href={bookmark.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-600 transition-colors hover:text-white"
            aria-label="Open link"
          >
            <ExternalLink className="size-3.5" strokeWidth={1.5} />
          </a>
        </span>
        <div className="flex items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={onEdit}
            aria-label="Edit bookmark"
            className="p-1 text-zinc-600 transition-colors hover:text-white"
          >
            <Pencil className="size-3.5" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete bookmark"
            className="p-1 text-zinc-600 transition-colors hover:text-white"
          >
            <Trash2 className="size-3.5" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  );
};
