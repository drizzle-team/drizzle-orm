# The driver exposes no retained-WAL metric

A consumer asked for the amount of WAL that a replication session holds on the server, to show slot growth in a dashboard. The driver does not expose it. The streaming connection cannot run queries while it is in copy mode, so the managed CDC layer would need a second connection only for this number, which breaks the one-connection rule of ADR 0011. The same number is one query on `pg_replication_slots` from any connection the consumer already has. Reopen this only if the layer gets a second connection for another reason.
