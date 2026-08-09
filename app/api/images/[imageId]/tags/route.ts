import { createClient } from "@/src/lib/supabase/server";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteParams = {
  params: Promise<{ imageId: string }>;
};

async function getAuthenticatedRequest(params: RouteParams) {
  const { imageId } = await params.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { imageId, supabase, user };
}

export async function POST(request: Request, params: RouteParams) {
  const { imageId, supabase, user } = await getAuthenticatedRequest(params);

  if (!user) {
    return Response.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  if (!uuidPattern.test(imageId)) {
    return Response.json({ error: "画像IDが不正です。" }, { status: 400 });
  }

  let tagIds: string[];
  try {
    const body = (await request.json()) as { tagIds?: unknown };
    if (
      !Array.isArray(body.tagIds) ||
      body.tagIds.length === 0 ||
      body.tagIds.length > 50 ||
      !body.tagIds.every(
        (tagId) => typeof tagId === "string" && uuidPattern.test(tagId)
      )
    ) {
      throw new Error("Invalid tag IDs");
    }
    tagIds = [...new Set(body.tagIds)];
  } catch {
    return Response.json({ error: "タグ情報が不正です。" }, { status: 400 });
  }

  const { data: image, error: imageError } = await supabase
    .from("images")
    .select("id")
    .eq("id", imageId)
    .maybeSingle();

  if (imageError || !image) {
    return Response.json({ error: "対象画像が見つかりません。" }, { status: 404 });
  }

  const { data: tags, error: tagsError } = await supabase
    .from("tags")
    .select("id, name")
    .in("id", tagIds);

  if (tagsError || !tags || tags.length !== tagIds.length) {
    return Response.json({ error: "対象タグが見つかりません。" }, { status: 404 });
  }

  const { data: currentRelations, error: relationsError } = await supabase
    .from("image_tags")
    .select("tag_id")
    .eq("image_id", imageId)
    .in("tag_id", tagIds);

  if (relationsError) {
    return Response.json({ error: "現在のタグ情報を確認できませんでした。" }, { status: 500 });
  }

  const existingTagIds = new Set(
    (currentRelations ?? []).map((relation) => relation.tag_id)
  );
  const missingTagIds = tagIds.filter((tagId) => !existingTagIds.has(tagId));

  if (missingTagIds.length > 0) {
    const { error: insertError } = await supabase.from("image_tags").insert(
      missingTagIds.map((tagId) => ({
        image_id: imageId,
        tag_id: tagId,
        created_by: user.id,
      }))
    );

    if (insertError) {
      const { data: latestRelations } = await supabase
        .from("image_tags")
        .select("tag_id")
        .eq("image_id", imageId)
        .in("tag_id", tagIds);

      if (latestRelations?.length !== tagIds.length) {
        return Response.json({ error: "タグを追加できませんでした。" }, { status: 500 });
      }
    }
  }

  return Response.json({ tags });
}

export async function DELETE(request: Request, params: RouteParams) {
  const { imageId, supabase, user } = await getAuthenticatedRequest(params);

  if (!user) {
    return Response.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  let tagId: string | null = null;
  try {
    const body = (await request.json()) as { tagId?: unknown };
    tagId = typeof body.tagId === "string" ? body.tagId : null;
  } catch {
    // 下の共通バリデーションで処理します。
  }

  if (!uuidPattern.test(imageId) || !tagId || !uuidPattern.test(tagId)) {
    return Response.json({ error: "画像またはタグIDが不正です。" }, { status: 400 });
  }

  const { error } = await supabase
    .from("image_tags")
    .delete()
    .eq("image_id", imageId)
    .eq("tag_id", tagId);

  if (error) {
    return Response.json({ error: "タグを外せませんでした。" }, { status: 500 });
  }

  return Response.json({ success: true });
}
