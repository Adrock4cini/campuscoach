DROP POLICY IF EXISTS syllabus_sources_owner_select ON storage.objects;
CREATE POLICY syllabus_sources_owner_select
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'syllabus-sources' AND public.owns_syllabus_storage_path(name));

DROP POLICY IF EXISTS syllabus_sources_owner_insert ON storage.objects;
CREATE POLICY syllabus_sources_owner_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'syllabus-sources' AND public.owns_active_syllabus_storage_path(name));

DROP POLICY IF EXISTS syllabus_sources_owner_delete_uncommitted ON storage.objects;
CREATE POLICY syllabus_sources_owner_delete_uncommitted
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'syllabus-sources'
    AND public.owns_syllabus_storage_path(name)
    AND NOT EXISTS (
      SELECT 1 FROM public.class_syllabi WHERE storage_path = name
    )
  );