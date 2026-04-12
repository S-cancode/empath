-- Restore the HNSW vector index that was accidentally dropped in 20260324143847
CREATE INDEX match_queue_embedding_idx ON match_queue_entries USING hnsw (embedding vector_cosine_ops);
