import { createClient } from "@/src/lib/supabase/server";
import { canonicalTagName, normalizeTagName } from "@/src/lib/tag-name";

type TagRow = {
  id: string;
  name: string;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  let name: string;
  try {
    const body = (await request.json()) as { name?: unknown };
    name = typeof body.name === "string" ? normalizeTagName(body.name) : "";
  } catch {
    name = "";
  }

  if (!name || name.length > 50) {
    return Response.json(
      { error: "タグ名は1〜50文字で入力してください。" },
      { status: 400 }
    );
  }

  const normalizedName = canonicalTagName(name);
  const findSameName = (tags: TagRow[] | null) =>
    tags?.find(
      (tag) => canonicalTagName(tag.name) === normalizedName
    );

  const { data: currentTags, error: selectError } = await supabase
    .from("tags")
    .select("id, name");

  if (selectError) {
    return Response.json({ error: "タグを確認できませんでした。" }, { status: 500 });
  }

  const existingTag = findSameName(currentTags as TagRow[] | null);
  if (existingTag) {
    return Response.json({ tag: existingTag, alreadyExisted: true });
  }

  const { data: createdTag, error: insertError } = await supabase
    .from("tags")
    .insert({ name, created_by: user.id })
    .select("id, name")
    .single();

  if (!insertError) {
    return Response.json({ tag: createdTag, alreadyExisted: false });
  }

  // DBの一意制約との競合時は、同時に作成されたタグを返します。
  const { data: latestTags } = await supabase.from("tags").select("id, name");
  const concurrentlyCreatedTag = findSameName(latestTags as TagRow[] | null);

  if (concurrentlyCreatedTag) {
    return Response.json({ tag: concurrentlyCreatedTag, alreadyExisted: true });
  }

  return Response.json({ error: "タグを作成できませんでした。" }, { status: 500 });
}
