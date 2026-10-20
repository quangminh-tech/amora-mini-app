-- Catalogue Studio is independent of products, prices and quotation history.
CREATE TABLE catalogue_documents (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL REFERENCES users(id),
    name varchar(180) NOT NULL,
    content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
    published_content jsonb,
    published_name varchar(180),
    version integer NOT NULL DEFAULT 1 CHECK(version > 0),
    archived boolean NOT NULL DEFAULT false,
    published_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX catalogue_documents_owner ON catalogue_documents(owner_id, updated_at DESC);
CREATE INDEX catalogue_documents_published ON catalogue_documents(published_at DESC) WHERE published_content IS NOT NULL AND NOT archived;
CREATE TABLE catalogue_assets (
    id uuid PRIMARY KEY,
    document_id uuid NOT NULL REFERENCES catalogue_documents(id),
    object_key text NOT NULL,
    content_type text NOT NULL CHECK(content_type IN ('image/jpeg','image/png','image/webp')),
    caption varchar(180) NOT NULL DEFAULT '',
    byte_size integer NOT NULL CHECK(byte_size > 0 AND byte_size <= 2097152),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX catalogue_assets_document ON catalogue_assets(document_id);
-- Object keys may be shared by document copies. No automatic R2 deletion.
