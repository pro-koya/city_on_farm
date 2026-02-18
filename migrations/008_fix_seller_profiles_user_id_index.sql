-- Migration: Fix seller_profiles_user_id_idx to be non-unique
-- Problem: The unique constraint on last_updated_by_user_id prevents a user
-- from updating multiple partner profiles, which is incorrect.
-- Solution: Drop the unique index and create a regular index for performance.

BEGIN;

-- Drop the incorrect unique index
DROP INDEX IF EXISTS seller_profiles_user_id_idx;

-- Create a regular (non-unique) index for query performance
CREATE INDEX IF NOT EXISTS idx_seller_profiles_last_updated_by_user
ON seller_profiles(last_updated_by_user_id);

COMMIT;
