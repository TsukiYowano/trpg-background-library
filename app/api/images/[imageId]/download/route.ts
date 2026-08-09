import { createPresignedAttachmentUrl } from "@/src/lib/r2";
import { createClient } from "@/src/lib/supabase/server";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteParams = {
  params: Promise<{ imageId: string }>;
};

export async function GET(_request: Request, routeParams: RouteParams) {
  const { imageId } = await routeParams.params;
  if (!uuidPattern.test(imageId)) {
    return Response.json({ error: "画像IDが不正です。" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  const { data: image, error } = await supabase
    .from("images")
    .select("storage_path, file_name")
    .eq("id", imageId)
    .maybeSingle();

  if (error) {
    return Response.json({ error: "画像情報を取得できませんでした。" }, { status: 500 });
  }

  if (!image) {
    return Response.json({ error: "対象画像が見つかりません。" }, { status: 404 });
  }

  try {
    const downloadUrl = await createPresignedAttachmentUrl(
      image.storage_path,
      image.file_name
    );
    return Response.redirect(downloadUrl, 302);
  } catch {
    return Response.json(
      { error: "ダウンロードURLを発行できませんでした。" },
      { status: 500 }
    );
  }
}
