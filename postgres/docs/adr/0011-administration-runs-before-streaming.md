# Slot administration runs on the streaming connection, before streaming starts

Eviction of a previous slot holder, the slot health check and the timeout probe all run on the same connection that later streams. The raw layer's `command()` guard rejects commands once the stream is live, so this order is enforced by the code: all administration must happen before `START_REPLICATION`.
