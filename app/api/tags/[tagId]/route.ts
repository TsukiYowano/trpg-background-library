import { createClient } from "@/src/lib/supabase/server";
import { canonicalTagName, normalizeTagName } from "@/src/lib/tag-name";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteParams = {
  params: Promise<{ tagId: string }>;
};

async function getAuthenticatedRequest(routeParams: RouteParams) {
  const { tagId } = await routeParams.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { tagId, supabase, user };
}

export async function PATCH(request: Request, routeParams: RouteParams) {
  const { tagId, supabase, user } = await getAuthenticatedRequest(routeParams);

  if (!user) {
    return Response.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  if (!uuidPattern.test(tagId)) {
    return Response.json({ error: "タグIDが不正です。" }, { status: 400 });
  }

  let name = "";
  try {
    const body = (await request.json()) as { name?: unknown };
    name = typeof body.name === "string" ? normalizeTagName(body.name) : "";
  } catch {
    // 下の共通バリデーションで処理します。
  }

  if (!name || name.length > 50) {
    return Response.json(
      { error: "タグ名は1〜50文字で入力してください。" },
      { status: 400 }
    );
  }

  const { data: currentTag, error: currentTagError } = await supabase
    .from("tags")
    .select("id, name")
    .eq("id", tagId)
    .maybeSingle();

  if (currentTagError || !currentTag) {
    return Response.json({ error: "対象タグが見つかりません。" }, { status: 404 });
  }

  const { data: tags, error: tagsError } = await supabase
    .from("tags")
    .select("id, name");

  if (tagsError) {
    return Response.json({ error: "タグ一覧を確認できませんでした。" }, { status: 500 });
  }

  const canonicalName = canonicalTagName(name);
  const duplicate = tags?.some(
    (tag) => tag.id !== tagId && canonicalTagName(tag.name) === canonicalName
  );

  if (duplicate) {
    return Response.json({ error: "同じ名前のタグがすでに存在します。" }, { status: 409 });
  }

  const { data: updatedTag, error: updateError } = await supabase
    .from("tags")
    .update({ name })
    .eq("id", tagId)
    .select("id, name")
    .single();

  if (updateError) {
    const { data: latestTags } = await supabase.from("tags").select("id, name");
    const nowDuplicated = latestTags?.some(
      (tag) => tag.id !== tagId && canonicalTagName(tag.name) === canonicalName
    );

    return Response.json(
      {
        error: nowDuplicated
          ? "同じ名前のタグがすでに存在します。"
          : "タグ名を変更できませんでした。",
      },
      { status: nowDuplicated ? 409 : 500 }
    );
  }

  return Response.json({ tag: updatedTag });
}

export async function DELETE(_request: Request, routeParams: RouteParams) {
  const { tagId, supabase, user } = await getAuthenticatedRequest(routeParams);

  if (!user) {
    return Response.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  if (!uuidPattern.test(tagId)) {
    return Response.json({ error: "タグIDが不正です。" }, { status: 400 });
  }

  const { data: tag, error: tagError } = await supabase
    .from("tags")
    .select("id, name")
    .eq("id", tagId)
    .maybeSingle();

  if (tagError || !tag) {
    return Response.json({ error: "対象タグが見つかりません。" }, { status: 404 });
  }

  const { count, error: countError } = await supabase
    .from("image_tags")
    .select("image_id", { count: "exact", head: true })
    .eq("tag_id", tagId);

  if (countError) {
    return Response.json({ error: "タグの使用状況を確認できませんでした。" }, { status: 500 });
  }

  if ((count ?? 0) > 0) {
    return Response.json(
      { error: `このタグは${count}枚の画像で使用中のため削除できません。` },
      { status: 409 }
    );
  }

  const { data: deletedTag, error: deleteError } = await supabase
    .from("tags")
    .delete()
    .eq("id", tagId)
    .select("id")
    .maybeSingle();

  if (deleteError || !deletedTag) {
    const { count: latestCount } = await supabase
      .from("image_tags")
      .select("image_id", { count: "exact", head: true })
      .eq("tag_id", tagId);

    return Response.json(
      {
        error:
          (latestCount ?? 0) > 0
            ? "このタグは画像で使用中のため削除できません。"
            : "タグを削除できませんでした。",
      },
      { status: (latestCount ?? 0) > 0 ? 409 : 500 }
    );
  }

  return Response.json({ success: true });
}
