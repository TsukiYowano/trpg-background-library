import { deleteR2Object } from "@/src/lib/r2";
import { createClient } from "@/src/lib/supabase/server";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteParams = {
  params: Promise<{ imageId: string }>;
};

export async function DELETE(_request: Request, routeParams: RouteParams) {
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

  const { data: image, error: selectError } = await supabase
    .from("images")
    .select("id, storage_path, uploaded_by")
    .eq("id", imageId)
    .maybeSingle();

  if (selectError) {
    return Response.json({ error: "画像情報を確認できませんでした。" }, { status: 500 });
  }

  if (!image) {
    return Response.json({ error: "対象画像が見つかりません。" }, { status: 404 });
  }

  if (image.uploaded_by !== user.id) {
    return Response.json(
      { error: "この画像を削除する権限がありません。" },
      { status: 403 }
    );
  }

  try {
    // object keyはクライアント値ではなく、DBに保存された値だけを使用します。
    await deleteR2Object(image.storage_path);
  } catch {
    return Response.json(
      { error: "画像ファイルを削除できませんでした。時間をおいて再度お試しください。" },
      { status: 502 }
    );
  }

  const { data: deletedImage, error: deleteError } = await supabase
    .from("images")
    .delete()
    .eq("id", imageId)
    .eq("uploaded_by", user.id)
    .select("id")
    .maybeSingle();

  if (deleteError) {
    return Response.json(
      {
        error:
          "画像ファイルは削除されましたが、画像情報の削除に失敗しました。管理者にお問い合わせください。",
      },
      { status: 500 }
    );
  }

  if (!deletedImage) {
    const { data: remainingImage } = await supabase
      .from("images")
      .select("id")
      .eq("id", imageId)
      .maybeSingle();

    if (remainingImage) {
      return Response.json(
        {
          error:
            "画像ファイルは削除されましたが、画像情報を削除できませんでした。管理者にお問い合わせください。",
        },
        { status: 500 }
      );
    }
  }

  return Response.json({ success: true });
}
