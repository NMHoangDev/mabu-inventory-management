-- Migration: Add is_friend column to zalo_groups table
ALTER TABLE public.zalo_groups ADD COLUMN IF NOT EXISTS is_friend BOOLEAN DEFAULT FALSE;
