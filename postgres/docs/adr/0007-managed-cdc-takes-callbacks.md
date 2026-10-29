# The managed CDC layer takes callbacks, not an async iterator

`replicate()` takes an `onTransaction` callback instead of returning an iterator. With an iterator, the driver would have to acknowledge a position when the consumer pulls the next item. That turns into "acknowledge before persisting" as soon as the consumer dispatches work asynchronously. With a callback, the driver knows when the handler has finished, and acknowledges only then.
