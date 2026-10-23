# `batchTransactions()` drops messages that are outside a transaction

`pg_logical_emit_message` can emit a message outside any transaction. `batchTransactions()` groups events by begin and commit, so it has no place for such a message, and it drops it. This is documented on the helper. A consumer that needs these messages reads the flat `start()` stream instead.
