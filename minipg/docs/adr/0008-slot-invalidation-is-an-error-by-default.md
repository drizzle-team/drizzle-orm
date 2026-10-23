# An invalidated durable slot is an error by default

When a durable slot is invalidated (absent after it was once seen, WAL lost, or no confirmed flush position), `replicate()` raises `SlotInvalidatedError` to `onFatalError` by default. Recreating the slot skips every change between the old confirmed position and the new start. A consumer that can rebuild its state absorbs that, but an audit log gets a permanent hole, so recreating must be an explicit choice: `onSlotInvalidated: 'recreate'`, or returning `'recreate'` from `onResume`.

A slot that is absent on the first connect is created. A slot that is absent on a later connect of the same handle is an invalidation, tracked with a flag on the handle. Always creating would silently perform the recreate that this rule exists to refuse.

A `system-changed` invalidation (a different database system behind the same address) never recreates, even with `'recreate'`, because it voids every earlier LSN.
