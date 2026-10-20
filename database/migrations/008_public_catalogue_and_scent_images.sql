ALTER TABLE catalogue_documents ADD COLUMN public_slug varchar(64);
ALTER TABLE catalogue_documents ADD COLUMN public_enabled boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX catalogue_public_slug ON catalogue_documents(public_slug) WHERE public_slug IS NOT NULL;
ALTER TABLE catalogue_documents ADD CONSTRAINT catalogue_public_requires_snapshot CHECK(NOT public_enabled OR (public_slug IS NOT NULL AND published_content IS NOT NULL));
CREATE TABLE scent_note_images (
    scent_id uuid NOT NULL REFERENCES scents(id),
    layer varchar(8) NOT NULL CHECK(layer IN ('top','middle','base')),
    object_key text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(scent_id,layer)
);
-- Existing publications remain private until a manager republishes explicitly.
