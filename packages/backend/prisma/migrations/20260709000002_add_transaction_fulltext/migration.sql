-- Add full-text search on transactions
-- Adds a search document column and GIN index for fast lookups

ALTER TABLE "transactions" ADD COLUMN "search_document" tsvector;

CREATE OR REPLACE FUNCTION transactions_search_update() RETURNS trigger AS $$
BEGIN
  NEW.search_document :=
    setweight(to_tsvector('english', COALESCE(NEW.to, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW."tx_hash", '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.status, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.chain, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER transactions_search_trigger
  BEFORE INSERT OR UPDATE ON "transactions"
  FOR EACH ROW EXECUTE FUNCTION transactions_search_update();

-- Backfill existing rows
UPDATE "transactions" SET "search_document" =
  setweight(to_tsvector('english', COALESCE("to", '')), 'A') ||
  setweight(to_tsvector('english', COALESCE("tx_hash", '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(status, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(chain, '')), 'C');

CREATE INDEX "transactions_search_idx" ON "transactions" USING GIN ("search_document");
