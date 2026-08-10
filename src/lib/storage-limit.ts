export const IMAGE_STORAGE_LIMIT_BYTES = 9_000_000_000;

export const STORAGE_LIMIT_ERROR_CODE = "STORAGE_LIMIT_EXCEEDED";

export const STORAGE_LIMIT_MESSAGE =
  "ストレージ容量が上限に達しました。新しい画像を追加するには、不要な画像を削除してください。";

export function parseStorageUsage(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) return parsed;
  }

  return null;
}

export function isStorageLimitDatabaseError(error: { message?: string } | null) {
  return error?.message?.includes(STORAGE_LIMIT_ERROR_CODE) ?? false;
}
