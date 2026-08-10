"use client";

import Image from "next/image";
import { useState } from "react";
import {
  ImageUploadDialog,
  type TagOption,
} from "./image-upload-dialog";
import { ImageTagEditor } from "./image-tag-editor";
import { TagManagementDialog } from "./tag-management-dialog";
import { IMAGE_STORAGE_LIMIT_BYTES } from "@/src/lib/storage-limit";

export type LibraryImage = {
  id: string;
  fileName: string;
  uploadedBy: string;
  createdAt: string;
  width: number | null;
  height: number | null;
  fileSize: number;
  signedUrl: string;
  tags: TagOption[];
};

type ImageLibraryProps = {
  images: LibraryImage[];
  initialStorageUsage: number;
  currentUserId: string;
  availableTags: TagOption[];
  tagLoadError: string | null;
  initialError: string | null;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatStorageSize(bytes: number) {
  if (bytes >= 1_000_000_000) {
    return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  }
  return `${Math.round(bytes / 1_000_000)} MB`;
}

export function ImageLibrary({
  images,
  initialStorageUsage,
  currentUserId,
  availableTags,
  tagLoadError,
  initialError,
}: ImageLibraryProps) {
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isTagManagementOpen, setIsTagManagementOpen] = useState(false);
  const [tagOverrides, setTagOverrides] = useState<Record<string, TagOption[]>>(
    {}
  );
  const [createdTags, setCreatedTags] = useState<TagOption[]>([]);
  const [filterTagIds, setFilterTagIds] = useState<string[]>([]);
  const [isUnclassifiedOnly, setIsUnclassifiedOnly] = useState(false);
  const [isFilterPickerOpen, setIsFilterPickerOpen] = useState(false);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");
  const [deletedImageIds, setDeletedImageIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [renamedTags, setRenamedTags] = useState<Record<string, string>>({});
  const [deletedTagIds, setDeletedTagIds] = useState<string[]>([]);

  const knownTags = [
    ...new Map(
      [...availableTags, ...createdTags].map((tag) => [tag.id, tag])
    ).values(),
  ]
    .filter((tag) => !deletedTagIds.includes(tag.id))
    .map((tag) => ({ ...tag, name: renamedTags[tag.id] ?? tag.name }));
  const activeImages = images.filter((image) => !deletedImageIds.includes(image.id));
  const locallyDeletedBytes = images
    .filter((image) => deletedImageIds.includes(image.id))
    .reduce((total, image) => total + image.fileSize, 0);
  const storageUsage = Math.max(0, initialStorageUsage - locallyDeletedBytes);
  const storageRemaining = Math.max(0, IMAGE_STORAGE_LIMIT_BYTES - storageUsage);
  const isStorageFull = storageUsage >= IMAGE_STORAGE_LIMIT_BYTES;
  const isStorageWarning = storageUsage >= 8_000_000_000;
  const storagePercentage = Math.min(
    100,
    (storageUsage / IMAGE_STORAGE_LIMIT_BYTES) * 100
  );
  const selectedImage =
    activeImages.find((image) => image.id === selectedImageId) ?? null;
  const selectedFilterTags = knownTags.filter((tag) =>
    filterTagIds.includes(tag.id)
  );
  const filterSummary = isUnclassifiedOnly
    ? "未分類のみ"
    : selectedFilterTags.length === 0
      ? "条件なし"
      : selectedFilterTags.length <= 2
        ? selectedFilterTags.map((tag) => tag.name).join("・")
        : `${selectedFilterTags.length}件選択中`;
  const filterCandidates = knownTags.filter(
    (tag) =>
      !filterTagIds.includes(tag.id) &&
      tag.name
        .toLocaleLowerCase("ja-JP")
        .includes(filterQuery.trim().toLocaleLowerCase("ja-JP"))
  );

  function tagsFor(image: LibraryImage) {
    return (tagOverrides[image.id] ?? image.tags)
      .filter((tag) => !deletedTagIds.includes(tag.id))
      .map((tag) => ({ ...tag, name: renamedTags[tag.id] ?? tag.name }));
  }

  function updateImageTags(imageId: string, tags: TagOption[]) {
    setTagOverrides((current) => ({ ...current, [imageId]: tags }));
  }

  function addKnownTag(tag: TagOption) {
    setCreatedTags((current) =>
      current.some((candidate) => candidate.id === tag.id)
        ? current
        : [...current, tag]
    );
  }

  const filteredImages = activeImages.filter((image) => {
    const imageTags = tagsFor(image);
    if (isUnclassifiedOnly) return imageTags.length === 0;

    const imageTagIds = new Set(imageTags.map((tag) => tag.id));
    return filterTagIds.every((tagId) => imageTagIds.has(tagId));
  });
  const tagUsageCounts = activeImages.reduce<Record<string, number>>(
    (counts, image) => {
      const uniqueTagIds = new Set(tagsFor(image).map((tag) => tag.id));
      uniqueTagIds.forEach((tagId) => {
        counts[tagId] = (counts[tagId] ?? 0) + 1;
      });
      return counts;
    },
    {}
  );

  function addFilterTag(tagId: string) {
    setFilterTagIds((current) =>
      current.includes(tagId) ? current : [...current, tagId]
    );
    setIsUnclassifiedOnly(false);
    setFilterQuery("");
  }

  function clearFilters() {
    setFilterTagIds([]);
    setIsUnclassifiedOnly(false);
    setFilterQuery("");
    setIsFilterPickerOpen(false);
  }

  async function deleteSelectedImage() {
    if (!selectedImage || isDeleting) return;

    const confirmed = window.confirm(
      "この画像を削除しますか？\nこの操作は元に戻せません。"
    );
    if (!confirmed) return;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const response = await fetch(`/api/images/${selectedImage.id}`, {
        method: "DELETE",
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? "画像を削除できませんでした。");
      }

      const deletedId = selectedImage.id;
      setDeletedImageIds((current) => [...current, deletedId]);
      setTagOverrides((current) => {
        const next = { ...current };
        delete next[deletedId];
        return next;
      });
      setSelectedImageId(null);
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "画像を削除できませんでした。"
      );
    } finally {
      setIsDeleting(false);
    }
  }

  function renameKnownTag(tag: TagOption) {
    setRenamedTags((current) => ({ ...current, [tag.id]: tag.name }));
  }

  function removeKnownTag(tagId: string) {
    setDeletedTagIds((current) =>
      current.includes(tagId) ? current : [...current, tagId]
    );
    setFilterTagIds((current) => current.filter((id) => id !== tagId));
  }

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-400">
            Album
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-stone-950 dark:text-stone-50">
            背景画像
          </h2>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            全{activeImages.length}件中 {filteredImages.length}件表示
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:items-end">
          <div
            className={`w-full min-w-56 rounded-lg border px-3 py-2 sm:w-64 ${
              isStorageWarning
                ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"
                : "border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900"
            }`}
          >
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-medium text-stone-600 dark:text-stone-300">
                ストレージ
              </span>
              <span className={isStorageWarning ? "font-semibold text-amber-800 dark:text-amber-300" : "text-stone-500 dark:text-stone-400"}>
                {formatStorageSize(storageUsage)} / 9 GB
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700">
              <div
                className={`h-full rounded-full ${isStorageWarning ? "bg-amber-600" : "bg-stone-600 dark:bg-stone-300"}`}
                style={{ width: `${storagePercentage}%` }}
              />
            </div>
            {isStorageWarning && (
              <p className="mt-1.5 text-xs text-amber-800 dark:text-amber-300">
                {isStorageFull
                  ? "上限に達しています"
                  : `残り約${formatStorageSize(storageRemaining)}`}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setIsUploadDialogOpen(true)}
            disabled={isStorageFull}
            title={isStorageFull ? "ストレージ容量が上限に達しています" : undefined}
            className="min-h-11 rounded-lg bg-stone-900 px-5 py-2.5 font-medium text-white shadow-sm transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-700 dark:bg-stone-50 dark:text-stone-950 dark:hover:bg-stone-200"
          >
            ＋ 画像を追加
          </button>
          <button
            type="button"
            onClick={() => setIsTagManagementOpen(true)}
            className="min-h-11 rounded-lg border border-stone-300 bg-white px-4 py-2.5 font-medium text-stone-700 transition hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
          >
            タグ管理
          </button>
          </div>
        </div>
      </div>

      {initialError && (
        <p
          role="status"
          className="mt-5 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
        >
          {initialError}
        </p>
      )}

      <section className="mt-6 overflow-hidden rounded-xl border border-stone-200 bg-white/90 shadow-sm shadow-stone-200/40 dark:border-stone-800 dark:bg-stone-900 dark:shadow-none">
        <button
          type="button"
          aria-expanded={isFilterPanelOpen}
          aria-controls="image-filter-panel"
          onClick={() => setIsFilterPanelOpen((current) => !current)}
          className="flex min-h-12 w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-amber-700 dark:hover:bg-stone-800 sm:px-5"
        >
          <span className="flex min-w-0 items-center gap-3">
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              className={`h-4 w-4 shrink-0 text-amber-700 transition-transform dark:text-amber-400 ${
                isFilterPanelOpen ? "rotate-180" : ""
              }`}
            >
              <path
                d="m5 7.5 5 5 5-5"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="font-semibold text-stone-800 dark:text-stone-100">
              タグで絞り込み
            </span>
          </span>
          <span
            className={`truncate text-sm ${
              filterTagIds.length > 0 || isUnclassifiedOnly
                ? "font-medium text-amber-800 dark:text-amber-300"
                : "text-stone-400 dark:text-stone-500"
            }`}
          >
            {filterSummary}
          </span>
        </button>

        {isFilterPanelOpen && (
          <div
            id="image-filter-panel"
            className="border-t border-stone-200 px-4 py-4 dark:border-stone-800 sm:px-5"
          >
            {(filterTagIds.length > 0 || isUnclassifiedOnly) && (
              <div className="mb-3 flex justify-end">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="min-h-9 rounded-md px-2 text-sm font-medium text-stone-500 hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
                >
                  絞り込み解除
                </button>
              </div>
            )}

        <div className="flex flex-wrap items-center gap-2">
          {selectedFilterTags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() =>
                setFilterTagIds((current) =>
                  current.filter((tagId) => tagId !== tag.id)
                )
              }
              className="min-h-8 rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-900 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-200"
            >
              {tag.name} ×
            </button>
          ))}
          <button
            type="button"
            onClick={() => setIsFilterPickerOpen((current) => !current)}
            disabled={isUnclassifiedOnly}
            className="min-h-8 rounded-full border border-dashed border-stone-400 px-3 py-1 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-stone-200 dark:hover:bg-stone-800"
          >
            + タグを選択
          </button>
        </div>

        {isFilterPickerOpen && !isUnclassifiedOnly && (
          <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-3 dark:border-stone-800 dark:bg-stone-950">
            <input
              type="search"
              value={filterQuery}
              onChange={(event) => setFilterQuery(event.target.value)}
              placeholder="タグ名を入力"
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
            <div className="mt-3 flex max-h-32 flex-wrap gap-2 overflow-y-auto">
              {filterCandidates.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => addFilterTag(tag.id)}
                  className="rounded-full border border-zinc-300 px-3 py-1 text-sm text-zinc-700 hover:bg-white dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                >
                  {tag.name}
                </button>
              ))}
              {filterCandidates.length === 0 && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  選択できるタグがありません。
                </p>
              )}
            </div>
          </div>
        )}

        <label className="mt-4 flex min-h-9 w-fit cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
          <input
            type="checkbox"
            checked={isUnclassifiedOnly}
            onChange={(event) => {
              const checked = event.target.checked;
              setIsUnclassifiedOnly(checked);
              if (checked) {
                setFilterTagIds([]);
                setFilterQuery("");
                setIsFilterPickerOpen(false);
              }
            }}
            className="h-4 w-4 rounded border-zinc-300"
          />
          未分類のみ
        </label>
          </div>
        )}
      </section>

      {activeImages.length === 0 && !initialError ? (
        <div className="mt-8 rounded-xl border border-dashed border-zinc-300 px-6 py-16 text-center text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          まだ画像がありません。「画像を追加」から最初の画像を登録してください。
        </div>
      ) : filteredImages.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-zinc-300 px-6 py-16 text-center text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          条件に一致する画像がありません。
        </div>
      ) : (
        <div className="mt-7 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredImages.map((image) => {
            const imageTags = tagsFor(image);
            const visibleTags = imageTags.slice(0, 3);

            return (
            <button
              key={image.id}
              type="button"
              onClick={() => {
                setDeleteError(null);
                setSelectedImageId(image.id);
              }}
              className="group overflow-hidden rounded-xl border border-stone-200 bg-white text-left shadow-sm shadow-stone-200/50 transition duration-200 hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-lg hover:shadow-stone-200/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 dark:border-stone-800 dark:bg-stone-900 dark:shadow-none dark:hover:border-stone-700"
            >
              <div className="relative aspect-video overflow-hidden bg-stone-100 dark:bg-stone-800">
                <Image
                  src={image.signedUrl}
                  alt={image.fileName}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                  className="object-cover transition duration-300 group-hover:scale-[1.02]"
                />
              </div>
              <div className="p-4 pb-4">
                <p className="truncate font-medium text-zinc-950 dark:text-zinc-50">
                  {image.fileName}
                </p>
                <time className="mt-1 block text-sm text-zinc-500 dark:text-zinc-400">
                  {formatDate(image.createdAt)}
                </time>
                <div className="mt-3 flex min-h-6 flex-wrap gap-1.5">
                  {visibleTags.length === 0 ? (
                    <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                      未分類
                    </span>
                  ) : (
                    visibleTags.map((tag) => (
                      <span
                        key={tag.id}
                        className="max-w-28 truncate rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                      >
                        {tag.name}
                      </span>
                    ))
                  )}
                  {imageTags.length > visibleTags.length && (
                    <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      +{imageTags.length - visibleTags.length}
                    </span>
                  )}
                </div>
              </div>
            </button>
            );
          })}
        </div>
      )}

      {isUploadDialogOpen && (
        <ImageUploadDialog
          initialTags={knownTags}
          initialTagError={tagLoadError}
          onTagCreated={addKnownTag}
          onClose={() => setIsUploadDialogOpen(false)}
        />
      )}

      {isTagManagementOpen && (
        <TagManagementDialog
          tags={knownTags}
          usageCounts={tagUsageCounts}
          onRename={renameKnownTag}
          onDelete={removeKnownTag}
          onClose={() => setIsTagManagementOpen(false)}
        />
      )}

      {selectedImage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${selectedImage.fileName}のプレビュー`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/85 p-3 backdrop-blur-sm sm:p-8"
          onClick={() => {
            if (!isDeleting) setSelectedImageId(null);
          }}
        >
          <div
            className="flex h-[85vh] max-h-[900px] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl shadow-black/30 dark:bg-stone-900"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-stone-200 px-4 py-3.5 dark:border-stone-800 sm:px-5">
              <div className="min-w-0">
                <p className="truncate font-medium text-zinc-950 dark:text-zinc-50">
                  {selectedImage.fileName}
                </p>
                <time className="mt-1 block text-sm text-zinc-500 dark:text-zinc-400">
                  {formatDate(selectedImage.createdAt)}
                </time>
                <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                  {selectedImage.width && selectedImage.height
                    ? `${selectedImage.width} × ${selectedImage.height}`
                    : "サイズ情報なし"}
                  <span aria-hidden="true" className="mx-2">・</span>
                  {formatFileSize(selectedImage.fileSize)}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <a
                  href={`/api/images/${selectedImage.id}/download`}
                  download={selectedImage.fileName}
                  className="min-h-9 rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
                >
                  画像を保存
                </a>
                {selectedImage.uploadedBy === currentUserId && (
                  <button
                    type="button"
                    onClick={deleteSelectedImage}
                    disabled={isDeleting}
                    className="min-h-9 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                  >
                    {isDeleting ? "削除中…" : "画像を削除"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedImageId(null)}
                  disabled={isDeleting}
                  className="min-h-9 rounded-lg px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50 dark:text-stone-200 dark:hover:bg-stone-800"
                >
                  閉じる
                </button>
              </div>
            </div>
            {deleteError && (
              <p
                role="alert"
                className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
              >
                {deleteError}
              </p>
            )}
            <div className="relative min-h-0 flex-1 bg-black">
              <Image
                src={selectedImage.signedUrl}
                alt={selectedImage.fileName}
                fill
                sizes="100vw"
                className="object-contain"
                priority
              />
            </div>
            <ImageTagEditor
              imageId={selectedImage.id}
              tags={tagsFor(selectedImage)}
              availableTags={knownTags}
              onTagsChange={(tags) => updateImageTags(selectedImage.id, tags)}
              onTagCreated={addKnownTag}
            />
          </div>
        </div>
      )}
    </>
  );
}
