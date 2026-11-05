-- Migration 004: accent- and case-insensitive search.
--
--   unaccent                  extension
--   f_unaccent(text)          IMMUTABLE wrapper (unaccent() itself is only
--                             STABLE, so it can't be used in an index)
--   trigram GIN indexes       on f_unaccent(lower(...)) for users.name,
--                             groups.name and posts.description
--
-- The search queries compare f_unaccent(lower(column)) against
-- f_unaccent(lower(query)), so "jose" matches "José".
--
-- Runs in one transaction and is idempotent.
-- Usage: psql -U postgres -p <port> -d social -f migrations/004_permalink_search.sql

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Schema-qualified dictionary + function so the result never depends on
-- search_path, which is what makes declaring it IMMUTABLE safe.
CREATE OR REPLACE FUNCTION f_unaccent(text)
    RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

CREATE INDEX IF NOT EXISTS idx_users_name_unaccent_trgm
    ON users USING gin (f_unaccent(lower(name)) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_groups_name_unaccent_trgm
    ON groups USING gin (f_unaccent(lower(name)) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_posts_description_unaccent_trgm
    ON posts USING gin (f_unaccent(lower(description)) gin_trgm_ops);

COMMIT;
