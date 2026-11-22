-- 014 — pin search_path on public.update_updated_at().
--
-- Supabase's security advisor (lint 0011, function_search_path_mutable)
-- flags a function whose search_path the caller can change. The trigger body
-- uses only now(), which lives in pg_catalog — always searched, even with
-- an empty search_path — so pinning it empty changes nothing it does.

alter function public.update_updated_at() set search_path = '';
