"use client";

import Image from "next/image";
import { ChangeEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type TagOption = {
  id: string;
  name: string;
};

type SelectedFile = {
  key: string;
  file: File;
  previewUrl: string;
  tagIds: string[];
};

type UploadResult = {
  key: string;
  fileName: string;
  registered: boolean;
  error?: string;
  tagWarning?: string;
};

type ImageUploadDialogProps = {
  initialTags: TagOption[];
  initialTagError: string | null;
  onTagCreated: (tag: TagOption) => void;
  onClose: () => void;
};

const allowedFileTypes: Record<string, readonly string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
};

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}:${file.type}`;
}

function isAllowedImage(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  return Boolean(extension && allowedFileTypes[file.type]?.includes(extension));
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getImageDimensions(file: File) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("画像のサイズを取得できませんでした。"));
    };
    image.src = objectUrl;
  });
}

export function ImageUploadDialog({
  initialTags,
  initialTagError,
  onTagCreated,
  onClose,
}: ImageUploadDialogProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [tags, setTags] = useState<TagOption[]>(initialTags);
  const [commonTagIds, setCommonTagIds] = useState<string[]>([]);
  const [tagQuery, setTagQuery] = useState("");
  const [activeFileTagKey, setActiveFileTagKey] = useState<string | null>(null);
  const [individualTagQuery, setIndividualTagQuery] = useState("");
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [selectionMessage, setSelectionMessage] = useState<string | null>(
    initialTagError
  );
  const [results, setResults] = useState<UploadResult[]>([]);

  const normalizedQuery = tagQuery.trim().replace(/\s+/g, " ");
  const filteredTags = tags.filter((tag) =>
    tag.name.toLocaleLowerCase("ja-JP").includes(
      normalizedQuery.toLocaleLowerCase("ja-JP")
    )
  );
  const exactTagExists = tags.some(
    (tag) =>
      tag.name.trim().toLocaleLowerCase("ja-JP") ===
      normalizedQuery.toLocaleLowerCase("ja-JP")
  );

  function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const incomingFiles = Array.from(event.target.files ?? []);
    const existingKeys = new Set(files.map((item) => item.key));
    const nextFiles: SelectedFile[] = [];
    let invalidCount = 0;
    let duplicateCount = 0;

    for (const file of incomingFiles) {
      const key = fileKey(file);
      if (!isAllowedImage(file)) {
        invalidCount += 1;
      } else if (existingKeys.has(key)) {
        duplicateCount += 1;
      } else {
        existingKeys.add(key);
        nextFiles.push({
          key,
          file,
          previewUrl: URL.createObjectURL(file),
          tagIds: [],
        });
      }
    }

    setFiles((current) => [...current, ...nextFiles]);
    setResults([]);
    setSelectionMessage(
      invalidCount || duplicateCount
        ? `${invalidCount ? `対応外形式 ${invalidCount}件` : ""}${
            invalidCount && duplicateCount ? "、" : ""
          }${duplicateCount ? `重複 ${duplicateCount}件` : ""}を追加しませんでした。`
        : null
    );
    event.target.value = "";
  }

  function removeFile(key: string) {
    setFiles((current) => {
      const target = current.find((item) => item.key === key);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((item) => item.key !== key);
    });
    if (activeFileTagKey === key) {
      setActiveFileTagKey(null);
      setIndividualTagQuery("");
    }
  }

  function toggleCommonTag(tagId: string) {
    setCommonTagIds((current) =>
      current.includes(tagId)
        ? current.filter((id) => id !== tagId)
        : [...current, tagId]
    );
  }

  function toggleIndividualTag(fileKey: string, tagId: string) {
    setFiles((current) =>
      current.map((item) =>
        item.key !== fileKey
          ? item
          : {
              ...item,
              tagIds: item.tagIds.includes(tagId)
                ? item.tagIds.filter((id) => id !== tagId)
                : [...item.tagIds, tagId],
            }
      )
    );
  }

  async function createTag(
    name: string,
    target: { type: "common" } | { type: "individual"; fileKey: string }
  ) {
    const normalizedName = name.trim().replace(/\s+/g, " ");
    if (!normalizedName || isCreatingTag) return;
    setIsCreatingTag(true);
    setSelectionMessage(null);

    try {
      const response = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: normalizedName }),
      });
      const result = (await response.json()) as {
        tag?: TagOption;
        error?: string;
      };

      if (!response.ok || !result.tag) {
        throw new Error(result.error ?? "タグを作成できませんでした。");
      }

      setTags((current) =>
        current.some((tag) => tag.id === result.tag!.id)
          ? current
          : [...current, result.tag!].sort((a, b) =>
              a.name.localeCompare(b.name, "ja")
            )
      );
      onTagCreated(result.tag);
      if (target.type === "common") {
        setCommonTagIds((current) =>
          current.includes(result.tag!.id) ? current : [...current, result.tag!.id]
        );
        setTagQuery("");
      } else {
        setFiles((current) =>
          current.map((item) =>
            item.key !== target.fileKey || item.tagIds.includes(result.tag!.id)
              ? item
              : { ...item, tagIds: [...item.tagIds, result.tag!.id] }
          )
        );
        setIndividualTagQuery("");
      }
    } catch (error) {
      setSelectionMessage(
        error instanceof Error ? error.message : "タグを作成できませんでした。"
      );
    } finally {
      setIsCreatingTag(false);
    }
  }

  async function uploadOne(item: SelectedFile): Promise<UploadResult> {
    try {
      const dimensions = await getImageDimensions(item.file);
      const urlResponse = await fetch("/api/images/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: item.file.name,
          contentType: item.file.type,
        }),
      });
      const details = (await urlResponse.json()) as {
        uploadUrl?: string;
        ticket?: string;
        error?: string;
      };

      if (!urlResponse.ok || !details.uploadUrl || !details.ticket) {
        throw new Error(details.error ?? "アップロードURLを発行できませんでした。");
      }

      const putResponse = await fetch(details.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": item.file.type },
        body: item.file,
      });
      if (!putResponse.ok) {
        throw new Error("R2へ画像をアップロードできませんでした。");
      }

      const finalTagIds = [...new Set([...commonTagIds, ...item.tagIds])];
      const completeResponse = await fetch("/api/images/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticket: details.ticket,
          width: dimensions.width,
          height: dimensions.height,
          fileSize: item.file.size,
          tagIds: finalTagIds,
        }),
      });
      const completed = (await completeResponse.json()) as {
        error?: string;
        tagError?: string;
      };

      if (!completeResponse.ok) {
        throw new Error(completed.error ?? "画像情報を登録できませんでした。");
      }

      return {
        key: item.key,
        fileName: item.file.name,
        registered: true,
        tagWarning: completed.tagError,
      };
    } catch (error) {
      return {
        key: item.key,
        fileName: item.file.name,
        registered: false,
        error: error instanceof Error ? error.message : "予期しないエラーです。",
      };
    }
  }

  async function uploadAll() {
    if (files.length === 0 || isUploading) return;
    const targets = [...files];
    const uploadResults: UploadResult[] = [];
    let nextIndex = 0;

    setIsUploading(true);
    setResults([]);
    setSelectionMessage(null);
    setProgress({ completed: 0, total: targets.length });

    async function worker() {
      while (nextIndex < targets.length) {
        const item = targets[nextIndex++];
        const result = await uploadOne(item);
        uploadResults.push(result);
        setProgress((current) => ({ ...current, completed: current.completed + 1 }));
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(3, targets.length) }, () => worker())
    );

    const registeredKeys = new Set(
      uploadResults.filter((result) => result.registered).map((result) => result.key)
    );
    setFiles((current) =>
      current.filter((item) => {
        if (!registeredKeys.has(item.key)) return true;
        URL.revokeObjectURL(item.previewUrl);
        return false;
      })
    );
    setResults(uploadResults);
    setIsUploading(false);

    if (registeredKeys.size > 0) router.refresh();
  }

  function closeDialog() {
    if (isUploading) return;
    files.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    onClose();
  }

  const registeredCount = results.filter((result) => result.registered).length;
  const failedResults = results.filter((result) => !result.registered);
  const tagWarnings = results.filter((result) => result.tagWarning);
  const normalizedIndividualQuery = individualTagQuery.trim().replace(/\s+/g, " ");
  const filteredIndividualTags = tags.filter((tag) =>
    tag.name.toLocaleLowerCase("ja-JP").includes(
      normalizedIndividualQuery.toLocaleLowerCase("ja-JP")
    )
  );
  const exactIndividualTagExists = tags.some(
    (tag) =>
      tag.name.trim().toLocaleLowerCase("ja-JP") ===
      normalizedIndividualQuery.toLocaleLowerCase("ja-JP")
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="画像の一括登録"
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/80 p-3 backdrop-blur-sm sm:p-5"
      onClick={closeDialog}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl shadow-black/30 dark:bg-stone-900"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-stone-200 px-5 py-4 dark:border-stone-800 sm:px-6">
          <div>
            <h2 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
              画像を一括登録
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {files.length}枚選択中
            </p>
          </div>
          <button
            type="button"
            onClick={closeDialog}
            disabled={isUploading}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            閉じる
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto bg-stone-50/60 p-4 dark:bg-stone-950/30 sm:p-6">
          <section className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
            <input
              ref={fileInputRef}
              id="batch-image-upload"
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              onChange={addFiles}
              disabled={isUploading}
              className="sr-only"
            />
            <label
              htmlFor="batch-image-upload"
              className={`inline-flex rounded-lg border border-zinc-300 px-4 py-2 font-medium text-zinc-900 dark:border-zinc-700 dark:text-zinc-100 ${
                isUploading
                  ? "cursor-not-allowed opacity-50"
                  : "cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              画像を選択
            </label>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              jpg、jpeg、png、webp。同じファイルは重複追加されません。
            </p>
          </section>

          {files.length > 0 && (
            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="font-medium text-stone-900 dark:text-stone-100">
                  選択画像
                </h3>
                <span className="text-sm text-stone-500 dark:text-stone-400">
                  画像ごとに個別タグを設定できます
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
              {files.map((item) => (
                <div
                  key={item.key}
                  className="min-w-0 rounded-xl border border-stone-200 bg-white p-3 shadow-sm dark:border-stone-800 dark:bg-stone-900"
                >
                  <div className="flex min-w-0 gap-3">
                    <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-800">
                      <Image
                        src={item.previewUrl}
                        alt={item.file.name}
                        fill
                        sizes="112px"
                        unoptimized
                        className="object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-950 dark:text-zinc-50">
                        {item.file.name}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        {formatFileSize(item.file.size)}
                      </p>
                      <button
                        type="button"
                        onClick={() => removeFile(item.key)}
                        disabled={isUploading}
                        className="mt-2 text-xs font-medium text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                      >
                        選択から削除
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {item.tagIds.map((tagId) => {
                      const tag = tags.find((candidate) => candidate.id === tagId);
                      return tag ? (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => toggleIndividualTag(item.key, tag.id)}
                          disabled={isUploading}
                          title="クリックして個別タグから外す"
                          className="rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-900 hover:bg-amber-200 disabled:opacity-50 dark:bg-amber-950 dark:text-amber-200"
                        >
                          {tag.name} ×
                        </button>
                      ) : null;
                    })}
                    <button
                      type="button"
                      onClick={() => {
                        setActiveFileTagKey((current) =>
                          current === item.key ? null : item.key
                        );
                        setIndividualTagQuery("");
                      }}
                      disabled={isUploading}
                      className="rounded-full border border-dashed border-zinc-400 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      + タグ
                    </button>
                  </div>

                  {activeFileTagKey === item.key && (
                    <div className="mt-3 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950">
                      <input
                        type="search"
                        value={individualTagQuery}
                        onChange={(event) => setIndividualTagQuery(event.target.value)}
                        disabled={isUploading}
                        placeholder="この画像のタグを検索・作成"
                        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-950 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                      />
                      {normalizedIndividualQuery && !exactIndividualTagExists && (
                        <button
                          type="button"
                          onClick={() =>
                            createTag(normalizedIndividualQuery, {
                              type: "individual",
                              fileKey: item.key,
                            })
                          }
                          disabled={isCreatingTag || isUploading}
                          className="mt-2 text-left text-xs font-medium text-blue-700 hover:underline disabled:opacity-50 dark:text-blue-300"
                        >
                          {isCreatingTag
                            ? "作成中…"
                            : `新規タグ「${normalizedIndividualQuery}」を作成して追加`}
                        </button>
                      )}
                      <div className="mt-2 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                        {filteredIndividualTags.map((tag) => {
                          const selected = item.tagIds.includes(tag.id);
                          return (
                            <button
                              key={tag.id}
                              type="button"
                              onClick={() => toggleIndividualTag(item.key, tag.id)}
                              disabled={isUploading}
                              className={`rounded-full border px-2.5 py-1 text-xs disabled:opacity-50 ${
                                selected
                                  ? "border-blue-600 bg-blue-600 text-white"
                                  : "border-zinc-300 text-zinc-700 hover:bg-white dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                              }`}
                            >
                              {tag.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              </div>
            </section>
          )}

          <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <h3 className="font-medium text-stone-950 dark:text-stone-50">共通タグ</h3>
                <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                  選択中のすべての画像に適用されます
                </p>
              </div>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                {commonTagIds.length}件選択
              </span>
            </div>
            <input
              type="search"
              value={tagQuery}
              onChange={(event) => setTagQuery(event.target.value)}
              disabled={isUploading}
              placeholder="既存タグを検索、または新しいタグ名を入力"
              className="mt-3 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-950 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
            />

            {normalizedQuery && !exactTagExists && (
              <button
                type="button"
                onClick={() => createTag(normalizedQuery, { type: "common" })}
                disabled={isCreatingTag || isUploading}
                className="mt-2 rounded-lg border border-dashed border-blue-400 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50 dark:text-blue-300 dark:hover:bg-blue-950"
              >
                {isCreatingTag
                  ? "作成中…"
                  : `新規タグ「${normalizedQuery}」を作成して選択`}
              </button>
            )}

            <div className="mt-3 flex max-h-40 flex-wrap gap-2 overflow-y-auto">
              {filteredTags.map((tag) => {
                const selected = commonTagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleCommonTag(tag.id)}
                    disabled={isUploading}
                    className={`rounded-full border px-3 py-1 text-sm transition disabled:opacity-50 ${
                      selected
                        ? "border-amber-700 bg-amber-700 text-white"
                        : "border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {tag.name}
                  </button>
                );
              })}
              {filteredTags.length === 0 && !normalizedQuery && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  登録済みタグはありません。入力欄から新規作成できます。
                </p>
              )}
            </div>
            {commonTagIds.length === 0 && (
              <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                タグを選ばない場合は未分類として登録されます。
              </p>
            )}
          </section>

          {selectionMessage && (
            <p role="status" className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              {selectionMessage}
            </p>
          )}

          {isUploading && (
            <div role="status" className="rounded-lg bg-blue-50 px-4 py-3 text-blue-800 dark:bg-blue-950 dark:text-blue-200">
              {progress.completed} / {progress.total} 件アップロード中
            </div>
          )}

          {results.length > 0 && !isUploading && (
            <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <p className="font-medium text-zinc-950 dark:text-zinc-50">
                {results.length}件中{registeredCount}件登録成功
                {failedResults.length > 0 && `、${failedResults.length}件失敗`}
              </p>
              {(failedResults.length > 0 || tagWarnings.length > 0) && (
                <ul className="mt-3 space-y-2 text-sm">
                  {failedResults.map((result) => (
                    <li key={result.key} className="text-red-700 dark:text-red-300">
                      {result.fileName}: {result.error}
                    </li>
                  ))}
                  {tagWarnings.map((result) => (
                    <li key={result.key} className="text-amber-700 dark:text-amber-300">
                      {result.fileName}: {result.tagWarning}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-end border-t border-stone-200 bg-white px-5 py-4 dark:border-stone-800 dark:bg-stone-900 sm:px-6">
          <button
            type="button"
            onClick={uploadAll}
            disabled={files.length === 0 || isUploading}
            className="min-h-11 rounded-lg bg-stone-900 px-6 py-2.5 font-medium text-white shadow-sm hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-stone-50 dark:text-stone-950 dark:hover:bg-stone-200"
          >
            {isUploading ? "登録中…" : `${files.length}枚を登録`}
          </button>
        </footer>
      </div>
    </div>
  );
}
