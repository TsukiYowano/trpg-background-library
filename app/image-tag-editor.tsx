"use client";

import { useState } from "react";
import type { TagOption } from "./image-upload-dialog";

type ImageTagEditorProps = {
  imageId: string;
  tags: TagOption[];
  availableTags: TagOption[];
  onTagsChange: (tags: TagOption[]) => void;
  onTagCreated: (tag: TagOption) => void;
};

function sortTags(tags: TagOption[]) {
  return [...tags].sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

export function ImageTagEditor({
  imageId,
  tags,
  availableTags,
  onTagsChange,
  onTagCreated,
}: ImageTagEditorProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const normalizedQuery = query.trim().replace(/\s+/g, " ");
  const currentTagIds = new Set(tags.map((tag) => tag.id));
  const selectableTags = availableTags.filter(
    (tag) =>
      !currentTagIds.has(tag.id) &&
      tag.name
        .toLocaleLowerCase("ja-JP")
        .includes(normalizedQuery.toLocaleLowerCase("ja-JP"))
  );
  const exactTagExists = availableTags.some(
    (tag) =>
      tag.name.trim().toLocaleLowerCase("ja-JP") ===
      normalizedQuery.toLocaleLowerCase("ja-JP")
  );

  async function addTags(tagsToAdd: TagOption[]) {
    const uniqueTags = [
      ...new Map(tagsToAdd.map((tag) => [tag.id, tag])).values(),
    ].filter((tag) => !currentTagIds.has(tag.id));
    if (uniqueTags.length === 0 || pendingAction) return;

    setPendingAction("add");
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/images/${imageId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagIds: uniqueTags.map((tag) => tag.id) }),
      });
      const result = (await response.json()) as {
        tags?: TagOption[];
        error?: string;
      };

      if (!response.ok || !result.tags) {
        throw new Error(result.error ?? "タグを追加できませんでした。");
      }

      onTagsChange(
        sortTags([
          ...new Map([...tags, ...result.tags].map((tag) => [tag.id, tag])).values(),
        ])
      );
      setSelectedTagIds([]);
      setQuery("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "タグを追加できませんでした。"
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function createAndAddTag() {
    if (!normalizedQuery || exactTagExists || pendingAction) return;
    setPendingAction("create");
    setErrorMessage(null);

    try {
      const response = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: normalizedQuery }),
      });
      const result = (await response.json()) as {
        tag?: TagOption;
        error?: string;
      };

      if (!response.ok || !result.tag) {
        throw new Error(result.error ?? "タグを作成できませんでした。");
      }

      onTagCreated(result.tag);

      const addResponse = await fetch(`/api/images/${imageId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagIds: [result.tag.id] }),
      });
      const addResult = (await addResponse.json()) as {
        tags?: TagOption[];
        error?: string;
      };

      if (!addResponse.ok || !addResult.tags) {
        throw new Error(
          addResult.error ?? "タグは作成されましたが、画像へ追加できませんでした。"
        );
      }

      onTagsChange(
        sortTags([
          ...new Map([...tags, ...addResult.tags].map((tag) => [tag.id, tag])).values(),
        ])
      );
      setQuery("");
      setSelectedTagIds([]);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "タグを作成できませんでした。"
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function removeTag(tagId: string) {
    if (pendingAction) return;
    setPendingAction(`remove:${tagId}`);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/images/${imageId}/tags`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagId }),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? "タグを外せませんでした。");
      }

      onTagsChange(tags.filter((tag) => tag.id !== tagId));
      setSelectedTagIds((current) => current.filter((id) => id !== tagId));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "タグを外せませんでした。"
      );
    } finally {
      setPendingAction(null);
    }
  }

  const selectedTags = availableTags.filter((tag) =>
    selectedTagIds.includes(tag.id)
  );

  return (
    <div className="shrink-0 border-t border-stone-200 bg-white px-4 py-3.5 dark:border-stone-800 dark:bg-stone-900 sm:px-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm font-medium text-zinc-700 dark:text-zinc-200">
          タグ
        </span>
        {tags.length === 0 ? (
          <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            未分類
          </span>
        ) : (
          tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => removeTag(tag.id)}
              disabled={pendingAction !== null}
              title="この画像からタグを外す"
              className="min-h-7 rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-900 hover:bg-amber-200 disabled:opacity-50 dark:bg-amber-950 dark:text-amber-200"
            >
              {tag.name} {pendingAction === `remove:${tag.id}` ? "…" : "×"}
            </button>
          ))
        )}
        <button
          type="button"
          onClick={() => setIsPickerOpen((current) => !current)}
          disabled={pendingAction !== null}
          className="min-h-7 rounded-full border border-dashed border-stone-400 px-3 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50 dark:text-stone-200 dark:hover:bg-stone-800"
        >
          + タグを追加
        </button>
      </div>

      {isPickerOpen && (
        <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-3 dark:border-stone-800 dark:bg-stone-950">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            disabled={pendingAction !== null}
            placeholder="既存タグを検索、または新しいタグ名を入力"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />

          {normalizedQuery && !exactTagExists && (
            <button
              type="button"
              onClick={createAndAddTag}
              disabled={pendingAction !== null}
              className="mt-2 text-sm font-medium text-blue-700 hover:underline disabled:opacity-50 dark:text-blue-300"
            >
              {pendingAction === "create"
                ? "作成して追加中…"
                : `新規タグ「${normalizedQuery}」を作成して追加`}
            </button>
          )}

          <div className="mt-3 flex max-h-28 flex-wrap gap-2 overflow-y-auto">
            {selectableTags.map((tag) => {
              const selected = selectedTagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() =>
                    setSelectedTagIds((current) =>
                      current.includes(tag.id)
                        ? current.filter((id) => id !== tag.id)
                        : [...current, tag.id]
                    )
                  }
                  disabled={pendingAction !== null}
                  className={`rounded-full border px-2.5 py-1 text-xs disabled:opacity-50 ${
                    selected
                      ? "border-amber-700 bg-amber-700 text-white"
                      : "border-zinc-300 text-zinc-700 hover:bg-white dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                  }`}
                >
                  {tag.name}
                </button>
              );
            })}
            {selectableTags.length === 0 && exactTagExists && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                このタグはすでに画像へ設定されています。
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => addTags(selectedTags)}
            disabled={selectedTags.length === 0 || pendingAction !== null}
            className="mt-3 rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-950"
          >
            {pendingAction === "add"
              ? "追加中…"
              : `選択した${selectedTags.length}件を追加`}
          </button>
        </div>
      )}

      {errorMessage && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
