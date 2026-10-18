-- Lightweight document snapshots; no new services or tables.
ALTER TABLE quotes ADD COLUMN document_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
