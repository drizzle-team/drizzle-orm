# Replication queue limit is on by default, the receive timeout is not

`maxQueueBytes` defaults to 64 MiB. A queue limit changes behavior only for a consumer that is already heading to an out-of-memory crash. A receive timeout changes behavior for every healthy idle stream, so the raw `replication()` layer leaves `receiveTimeoutMs` off.

The managed `cdc` layer derives its timers from the server's `wal_sender_timeout`. The receive timeout is twice that value and at least 60 s. It stays off when `wal_sender_timeout` is 0. A fixed 60 s default fired falsely at about 70 s on a healthy idle stream: the server pings only after the client has been silent for `wal_sender_timeout / 2`, and the client's status messages keep resetting that clock.

Backpressure pauses the receive-timeout clock (the shared `qPaused` field). The timeout measures silence, and backpressure causes silence on purpose, so without the pause a slow consumer would get a liveness error from a healthy connection.
