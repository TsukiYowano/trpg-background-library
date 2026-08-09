"use client";

import { useState } from "react";
import type { TagOption } from "./image-upload-dialog";

type TagManagementDialogProps = {
  tags: TagOption[];
  usageCounts: Record<string, number>;
  onRename: (tag: TagOption) => void;
  onDelete: (tagId: string) => void;
  onClose: () => void;
};

export function TagManagementDialog({
  tags,
  usageCounts,
  onRename,
  onDelete,
  onClose,
}: TagManagementDialogProps) {
  const [query, setQuery] = useState("");
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const filteredTags = tags
    .filter((tag) =>
      tag.name
        .toLocaleLowerCase("ja-JP")
        .includes(query.trim().toLocaleLowerCase("ja-JP"))
    )
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));

  function startEditing(tag: TagOption) {
    setEditingTagId(tag.id);
    setEditingName(tag.name);
    setErrorMessage(null);
  }

  async function renameTag(tagId: string) {
    if (pendingAction) return;
    setPendingAction(`rename:${tagId}`);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/tags/${tagId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingName }),
      });
      const result = (await response.json()) as {
        tag?: TagOption;
        error?: string;
      };

      if (!response.ok || !result.tag) {
        throw new Error(result.error ?? "タグ名を変更できませんでした。");
      }

      onRename(result.tag);
      setEditingTagId(null);
      setEditingName("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "タグ名を変更できませんでした。"
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function deleteTag(tag: TagOption) {
    if (pendingAction || (usageCounts[tag.id] ?? 0) > 0) return;
    if (!window.confirm(`タグ「${tag.name}」を削除しますか？`)) return;

    setPendingAction(`delete:${tag.id}`);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/tags/${tag.id}`, { method: "DELETE" });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? "タグを削除できませんでした。");
      }

      onDelete(tag.id);
      if (editingTagId === tag.id) {
        setEditingTagId(null);
        setEditingName("");
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "タグを削除できませんでした。"
      );
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="タグ管理"
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/80 p-3 backdrop-blur-sm sm:p-5"
      onClick={() => {
        if (!pendingAction) onClose();
      }}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl shadow-black/30 dark:bg-stone-900"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-stone-200 px-5 py-4 dark:border-stone-800 sm:px-6">
          <div>
            <h2 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
              タグ管理
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {tags.length}件のタグ
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pendingAction !== null}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            閉じる
          </button>
        </header>

        <div className="shrink-0 border-b border-stone-200 bg-stone-50/70 p-4 dark:border-stone-800 dark:bg-stone-950/30 sm:px-6">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="タグ名で検索"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-950 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
          />
          {errorMessage && (
            <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
              {errorMessage}
            </p>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {filteredTags.length === 0 ? (
            <p className="py-10 text-center text-zinc-500 dark:text-zinc-400">
              条件に一致するタグがありません。
            </p>
          ) : (
            <ul className="space-y-2">
              {filteredTags.map((tag) => {
                const usageCount = usageCounts[tag.id] ?? 0;
                const isEditing = editingTagId === tag.id;

                return (
                  <li
                    key={tag.id}
                    className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900"
                  >
                    {isEditing ? (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                          type="text"
                          value={editingName}
                          onChange={(event) => setEditingName(event.target.value)}
                          disabled={pendingAction !== null}
                          maxLength={50}
                          className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => renameTag(tag.id)}
                            disabled={pendingAction !== null}
                            className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-950"
                          >
                            {pendingAction === `rename:${tag.id}` ? "保存中…" : "保存"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingTagId(null)}
                            disabled={pendingAction !== null}
                            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
                          >
                            キャンセル
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="break-words font-medium text-zinc-950 dark:text-zinc-50">
                            {tag.name}
                          </p>
                          <span
                            className={`mt-1.5 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                              usageCount === 0
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300"
                            }`}
                          >
                            {usageCount === 0 ? "未使用" : `${usageCount}枚で使用中`}
                          </span>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            onClick={() => startEditing(tag)}
                            disabled={pendingAction !== null}
                            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                          >
                            名前変更
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteTag(tag)}
                            disabled={pendingAction !== null || usageCount > 0}
                            title={usageCount > 0 ? `${usageCount}枚で使用中です` : undefined}
                            className="rounded-md px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-950"
                          >
                            {pendingAction === `delete:${tag.id}` ? "削除中…" : "削除"}
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
