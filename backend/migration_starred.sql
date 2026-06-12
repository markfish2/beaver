-- Migration: Rename is_pinned to is_starred in documents table
-- This script renames the column from is_pinned to is_starred

ALTER TABLE documents RENAME COLUMN is_pinned TO is_starred;
