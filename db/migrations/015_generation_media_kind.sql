-- Advanced Studio stores image and video runs in the shared generations
-- history. Existing records are images; new video runs opt in explicitly.
ALTER TABLE generations
  ADD COLUMN media_kind TEXT NOT NULL DEFAULT 'image'
  CHECK (media_kind IN ('image', 'video'));

CREATE INDEX idx_generations_media_kind ON generations(media_kind);
