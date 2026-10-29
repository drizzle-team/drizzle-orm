# Copy mode exits on the next `command()`, not when `start()` ends

The replication connection leaves copy mode lazily, when the next `command()` runs. It does not send CopyDone in the `finally` of `start()`. An eager CopyDone breaks the pattern of calling `ack()` after a `break` out of the event loop, which the test suite and consumers rely on.
