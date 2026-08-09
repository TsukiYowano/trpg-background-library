import {
  deleteR2Object,
  getR2ObjectMetadata,
  verifyUploadTicket,
} from "@/src/lib/r2";
import { createClient } from "@/src/lib/supabase/server";

type CompleteUploadBody = {
  ticket?: unknown;
  width?: unknown;
  height?: unknown;
  fileSize?: unknown;
  tagIds?: unknown;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  let body: CompleteUploadBody;
  try {
    body = (await request.json()) as CompleteUploadBody;
  } catch {
    return Response.json({ error: "リクエストが不正です。" }, { status: 400 });
  }

  if (
    typeof body.ticket !== "string" ||
    !isPositiveInteger(body.width) ||
    !isPositiveInteger(body.height) ||
    !isPositiveInteger(body.fileSize) ||
    !Array.isArray(body.tagIds) ||
    body.tagIds.length > 50 ||
    !body.tagIds.every((tagId) =>
      typeof tagId === "string" && uuidPattern.test(tagId)
    )
  ) {
    return Response.json({ error: "画像情報が不正です。" }, { status: 400 });
  }

  const ticket = verifyUploadTicket(body.ticket, user.id);
  if (!ticket) {
    return Response.json(
      { error: "アップロード情報の有効期限が切れているか、不正です。" },
      { status: 400 }
    );
  }

  const tagIds = [...new Set(body.tagIds as string[])];

  try {
    const object = await getR2ObjectMetadata(ticket.objectKey);
    if (
      object.ContentLength !== body.fileSize ||
      object.ContentType !== ticket.contentType
    ) {
      try {
        await deleteR2Object(ticket.objectKey);
      } catch {
        return Response.json(
          { error: "ファイル情報が一致せず、アップロード済みファイルも削除できませんでした。" },
          { status: 500 }
        );
      }

      return Response.json(
        { error: "ファイル情報が一致しないため、アップロードを取り消しました。" },
        { status: 400 }
      );
    }
  } catch {
    return Response.json(
      { error: "アップロードされた画像を確認できませんでした。" },
      { status: 400 }
    );
  }

  const { data: existingImage } = await supabase
    .from("images")
    .select("id")
    .eq("storage_path", ticket.objectKey)
    .maybeSingle();

  if (existingImage) {
    return Response.json({ success: true, imageId: existingImage.id });
  }

  const { data: insertedImage, error: insertError } = await supabase
    .from("images")
    .insert({
      file_name: ticket.fileName,
      storage_path: ticket.objectKey,
      uploaded_by: user.id,
      width: body.width,
      height: body.height,
      file_size: body.fileSize,
    })
    .select("id")
    .single();

  if (insertError) {
    const { data: concurrentlyInsertedImage } = await supabase
      .from("images")
      .select("id")
      .eq("storage_path", ticket.objectKey)
      .maybeSingle();

    if (concurrentlyInsertedImage) {
      return Response.json({ success: true, imageId: concurrentlyInsertedImage.id });
    }

    try {
      await deleteR2Object(ticket.objectKey);
    } catch {
      return Response.json(
        {
          error:
            "画像情報の登録に失敗し、アップロード済みファイルも削除できませんでした。管理者にお問い合わせください。",
        },
        { status: 500 }
      );
    }

    return Response.json(
      { error: "画像情報を登録できませんでした。アップロードしたファイルは削除しました。" },
      { status: 500 }
    );
  }

  if (tagIds.length > 0) {
    const { data: existingTags, error: tagsError } = await supabase
      .from("tags")
      .select("id")
      .in("id", tagIds);

    if (tagsError || existingTags?.length !== tagIds.length) {
      return Response.json({
        success: true,
        imageId: insertedImage.id,
        tagError: "画像は登録されましたが、一部のタグを確認できずタグ付けに失敗しました。",
      });
    }

    const { error: imageTagsError } = await supabase.from("image_tags").insert(
      tagIds.map((tagId) => ({
        image_id: insertedImage.id,
        tag_id: tagId,
        created_by: user.id,
      }))
    );

    if (imageTagsError) {
      return Response.json({
        success: true,
        imageId: insertedImage.id,
        tagError: "画像は登録されましたが、タグ付けに失敗しました。",
      });
    }
  }

  return Response.json({ success: true, imageId: insertedImage.id });
}
