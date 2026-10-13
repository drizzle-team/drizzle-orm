UQL	Drizzle
SQL generation	Direct string-chunk accumulation — no AST	Two-phase: build SQL AST tree, then serialize it
Context	1 object + 2 arrays (sqlChunks[], params[])	Builder instance + config + dialect + multiple intermediate SQL/StringChunk/Param/Name objects
Metadata	Pre-computed in global Map at decoration time; getMeta() = Map.get() + boolean check	Column/table objects always available, but is() checks, Object.keys(), Object.entries() called repeatedly at query time
String building	Array.push() fragments → single .join('') at the end	Recursive tree walk pushing to acc.sqlParts[] → .join('')
Object Allocations Per Query
Query	UQL	Drizzle	Ratio
Simple SELECT	~5	~31	6x
INSERT (10 rows)	~5	~124+	25x
DELETE	~7	~20	3x
This directly correlates with the benchmark ratios.
Top Bottlenecks in Drizzle (Ordered by Impact)
1. INSERT .values() — Per-row Param wrapping (CRITICAL)
File: node_modules/drizzle-orm/pg-core/query-builders/insert.js:30-44
For 10 rows × 5 columns: creates 10 result objects, 10 Object.keys() arrays, 50 new Param() objects, 50 is() checks. UQL does none of this — it pushes raw values directly to ctx.params.
Fix: Skip the Param wrapping in .values() entirely. Push raw values during SQL serialization, not during builder construction.
2. Two-phase AST architecture (CRITICAL, systemic)
Every sql\...\` tagged template creates: 1 queryChunks[], N StringChunk objects, 1 SQL` object. The SQL constructor then scans all chunks for Table references. For INSERT, the nesting is 3-4 levels deep.
UQL alternative: Methods like find(), insert(), where() directly push SQL string fragments to a flat array. No intermediate representation.
Fix (incremental): For hot paths like INSERT/UPDATE, bypass the AST and build SQL directly using string accumulation. A buildInsertSQL() fast path could do what UQL does.
3. buildInsertQuery() — Triple array creation (HIGH)
File: node_modules/drizzle-orm/pg-core/dialect.js:224-260
Object.entries(columns).filter(...) = 2 arrays. .map(...) = 1 more. Per row: 1 valueList[]. 9 separator sql\, \` objects. Then sql.join()` = another array + SQL.
Fix: Pre-compute column entries once (cache on table). Use a simple loop instead of entries→filter→map chain. Build the VALUES clause with direct string pushes instead of nested SQL objects.
4. toSQL() destructure spread (MODERATE, affects ALL paths)
File: Every query builder's toSQL() (e.g., select.js:288, insert.js:151)
const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
return rest;
Creates a new object every call just to strip typings.
Fix: Return the object as-is and let consumers ignore typings, or add a flag to sqlToQuery to skip it.
5. orderSelectedFields() — Object.entries + reduce + per-field allocations (MODERATE)
File: node_modules/drizzle-orm/utils.js:39-51
Called on every SELECT. Creates Object.entries() array, per-field [name] path arrays, per-field {path, field} objects, multiple is() checks.
Fix: Accept flat field arrays directly, or cache the ordered fields on the table schema.
6. from() unnecessary field spread (LOW)
File: node_modules/drizzle-orm/pg-core/query-builders/select.js:54
this.config.fields = { ...fields } — defensive copy of user-provided fields that's never mutated.
Fix: Store the reference directly.
7. mapUpdateSet() — entries→filter→map→fromEntries (MODERATE)
File: node_modules/drizzle-orm/utils.js:60-67
Four successive allocations. Each field creates a [key, value] tuple + Param object.
Fix: Single-pass loop building the result object directly.
What Makes UQL Fast (Lessons for Drizzle)
1. Zero-AST direct generation — SQL fragments pushed to a flat string[], joined once.
2. Pre-computed entity metadata — Map.get() is the entire cost of schema lookup.
3. Mutable context, not immutable builders — No new objects returned from chainable methods.
4. Static operator maps — COMPARE_OP_MAP[$gt] returns ' > ' directly.
5. No unnecessary copies — Input objects reused by reference where safe.
6. Minimal class hierarchy — 3-4 method calls from entry to SQL output.
Recommended Priority
1. Add fast-path INSERT bypassing the AST for the common case (biggest win — 36x gap)
2. Eliminate per-value Param wrapping in .values() and .set()
3. Cache column metadata (Object.entries(columns).filter(...)) on the table object
4. Remove toSQL() destructure spread across all builders
5. Long-term: Consider a direct-generation mode for simple queries that skips the SQL AST entirely