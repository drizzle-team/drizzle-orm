# A handler error retries the batch in place

When `onTransaction` throws, the managed layer presents the same in-memory transaction again on the same session. It does not restart the session. A logical walsender accepts only one `START_REPLICATION`, so restarting would need a full reconnect. Retrying in place needs no reconnect and no extra commands, and the handler sees the same transaction it was promised.
