import { signOut } from "./actions";
import { GoogleLoginButton } from "./google-login-button";
import { ImageLibrary, type LibraryImage } from "./image-library";
import type { TagOption } from "./image-upload-dialog";
import { createPresignedDownloadUrl } from "@/src/lib/r2";
import { createClient } from "@/src/lib/supabase/server";

type ImageRow = {
  id: string;
  file_name: string;
  storage_path: string;
  uploaded_by: string;
  created_at: string;
  width: number | null;
  height: number | null;
  file_size: number;
  image_tags: Array<{
    tags: TagOption | TagOption[] | null;
  }>;
};

function getImageTags(image: ImageRow) {
  const tags = image.image_tags.flatMap((relation) => {
    if (!relation.tags) return [];
    return Array.isArray(relation.tags) ? relation.tags : [relation.tags];
  });

  return [...new Map(tags.map((tag) => [tag.id, tag])).values()].sort((a, b) =>
    a.name.localeCompare(b.name, "ja")
  );
}

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-100 px-6 dark:bg-stone-950">
        <section className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8 shadow-lg shadow-stone-200/50 dark:border-stone-800 dark:bg-stone-900 dark:shadow-none">
          <h1 className="text-2xl font-semibold tracking-tight text-stone-950 dark:text-stone-50">
            TRPG背景アルバム
          </h1>
          <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
            セッション用の背景画像をみんなで共有・整理
          </p>
          <div className="mt-6 space-y-6">
            <p className="text-zinc-600 dark:text-zinc-300">
              続行するにはログインしてください。
            </p>
            <GoogleLoginButton />
          </div>
        </section>
      </main>
    );
  }

  const [imagesResult, tagsResult] = await Promise.all([
    supabase
      .from("images")
      .select(
        "id, file_name, storage_path, uploaded_by, created_at, width, height, file_size, image_tags(tags(id, name))"
      )
      .order("created_at", { ascending: false }),
    supabase.from("tags").select("id, name").order("name"),
  ]);

  const { data, error } = imagesResult;
  const availableTags = (tagsResult.data ?? []) as TagOption[];

  const rows = (data ?? []) as ImageRow[];
  const images: LibraryImage[] = [];
  let listErrorMessage = error
    ? "画像一覧を取得できませんでした。時間をおいて再度お試しください。"
    : null;

  if (!error) {
    const signedImages = await Promise.all(
      rows.map(async (image) => {
        try {
          return {
            id: image.id,
            fileName: image.file_name,
            uploadedBy: image.uploaded_by,
            createdAt: image.created_at,
            width: image.width,
            height: image.height,
            fileSize: image.file_size,
            signedUrl: await createPresignedDownloadUrl(image.storage_path),
            tags: getImageTags(image),
          } satisfies LibraryImage;
        } catch {
          return null;
        }
      })
    );

    images.push(...signedImages.filter((image) => image !== null));

    if (images.length !== rows.length) {
      listErrorMessage =
        "一部の画像を表示できませんでした。ページを再読み込みしてください。";
    }
  }

  return (
    <main className="min-h-screen bg-stone-100/70 dark:bg-stone-950">
      <header className="border-b border-stone-200 bg-white/95 shadow-sm shadow-stone-200/40 backdrop-blur dark:border-stone-800 dark:bg-stone-900/95 dark:shadow-none">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-stone-950 dark:text-stone-50 sm:text-3xl">
              TRPG背景アルバム
            </h1>
            <p className="mt-1.5 text-sm text-stone-500 dark:text-stone-400">
              セッション用の背景画像をみんなで共有・整理
            </p>
          </div>
          <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end sm:gap-2">
            <p className="min-w-0 truncate text-sm text-stone-500 dark:text-stone-400">
              {user.email}
            </p>
            <form action={signOut}>
            <button
              type="submit"
              className="min-h-10 rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
            >
              ログアウト
            </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-6 sm:py-10">
        <ImageLibrary
          images={images}
          currentUserId={user.id}
          availableTags={availableTags}
          tagLoadError={
            tagsResult.error
              ? "タグ一覧を取得できませんでした。再読み込みしてください。"
              : null
          }
          initialError={listErrorMessage}
        />
      </div>
    </main>
  );
}
