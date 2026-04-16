// Nodejs has enabled Temporal by default on the main fork
// This won't be necessary in the future.
// NOTE: when the polyfill runs (Node <22 / V8 without Temporal), runtime behavior is
// temporal-polyfill's, not V8's — they diverge in minor ways (e.g. Duration.from's
// tolerance of extra fields on Duration-like inputs). Tests should rely on documented
// Temporal semantics, not implementation-specific quirks.

import { Temporal } from 'temporal-polyfill';

if (typeof (globalThis as { Temporal?: unknown }).Temporal === 'undefined') {
	(globalThis as { Temporal: typeof Temporal }).Temporal = Temporal;
}
