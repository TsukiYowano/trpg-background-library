import { createPresignedUpload } from "@/src/lib/r2";
import { createClient } from "@/src/lib/supabase/server";

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
    };

    if (
      typeof body.fileName !== "string" ||
      body.fileName.length === 0 ||
      body.fileName.length > 255 ||
      typeof body.contentType !== "string"
    ) {
      return Response.json({ error: "ファイル情報が不正です。" }, { status: 400 });
    }

    const result = await createPresignedUpload(
      user.id,
      body.fileName,
      body.contentType
    );
    return Response.json(result);
  } catch {
    return Response.json(
      { error: "アップロードURLを発行できませんでした。" },
      { status: 400 }
    );
  }
}
