revoke update on table public.images from authenticated;
grant update (file_name) on table public.images to authenticated;

drop policy if exists "images_update_own_file_name" on public.images;

create policy "images_update_own_file_name"
on public.images
for update
to authenticated
using (uploaded_by = auth.uid())
with check (uploaded_by = auth.uid());
