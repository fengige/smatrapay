create policy "Authenticated can read avatars" on storage.objects for select to authenticated using (bucket_id = 'avatars');
create policy "Authenticated can upload avatars" on storage.objects for insert to authenticated with check (bucket_id = 'avatars');
create policy "Authenticated can update avatars" on storage.objects for update to authenticated using (bucket_id = 'avatars') with check (bucket_id = 'avatars');
create policy "Authenticated can delete avatars" on storage.objects for delete to authenticated using (bucket_id = 'avatars');