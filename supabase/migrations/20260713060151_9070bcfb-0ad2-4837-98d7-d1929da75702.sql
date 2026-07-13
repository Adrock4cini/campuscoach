ALTER TABLE public.classes
  ADD CONSTRAINT classes_client_class_id_unique UNIQUE (client_class_id);