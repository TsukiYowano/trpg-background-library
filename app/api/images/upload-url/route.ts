import { createPresignedUpload } from "@/src/lib/r2";
import {
  IMAGE_STORAGE_LIMIT_BYTES,
  parseStorageUsage,
  STORAGE_LIMIT_ERROR_CODE,
  STORAGE_LIMIT_MESSAGE,
} from "@/src/lib/storage-limit";
import { createClient } from "@/src/lib/supabase/server";

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      fileName?: unknown;
      contentType?: unknown;
      fileSize?: unknown;
    };

    if (
      typeof body.fileName !== "string" ||
      body.fileName.length === 0 ||
      body.fileName.length > 255 ||
      typeof body.contentType !== "string" ||
      !isPositiveInteger(body.fileSize)
    ) {
      return Response.json({ error: "ファイル情報が不正です。" }, { status: 400 });
    }

    const { data: usageValue, error: usageError } = await supabase.rpc(
      "get_image_storage_usage"
    );
    const currentUsage = parseStorageUsage(usageValue);
    if (usageError || currentUsage === null) {
      return Response.json(
        { error: "STORAGE_USAGE_UNAVAILABLE", message: "ストレージ使用量を確認できませんでした。" },
        { status: 500 }
      );
    }

    if (currentUsage + body.fileSize > IMAGE_STORAGE_LIMIT_BYTES) {
      return Response.json(
        { error: STORAGE_LIMIT_ERROR_CODE, message: STORAGE_LIMIT_MESSAGE },
        { status: 413 }
      );
    }

    const result = await createPresignedUpload(
      user.id,
      body.fileName,
      body.contentType,
      body.fileSize
    );
    return Response.json(result);
  } catch {
    return Response.json(
      { error: "アップロードURLを発行できませんでした。" },
      { status: 400 }
    );
  }
}
