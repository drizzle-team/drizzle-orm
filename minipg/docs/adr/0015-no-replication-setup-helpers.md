# The driver ships no replication setup helpers

An `ensurePublication` helper and a helper that forces `REPLICA IDENTITY FULL` were proposed and dropped. A publication is often shared, and a helper cannot change its table list safely without knowing who else depends on it. Changing a table's replica identity is a schema migration, which belongs to the consumer's migration tool. The driver validates publications at start (ADR 0002) and leaves their setup to the consumer.
