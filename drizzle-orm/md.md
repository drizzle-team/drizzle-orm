Key Bottlenecks
1. SelectResult branches through 3 conditional paths - even for simple single-table selects, TypeScript must evaluate all branches
2. SelectResultField is a 6-way conditional type - evaluated per column:
      T extends DrizzleTypeError ? ...
   : T extends Table ? ...
   : T extends Column ? GetColumnData<T>
   : T extends SQL ? ...
   : T extends Record<string, any> ? SelectResultFields<T>
   : never
   
3. BuildSubquerySelection is computed separately from SelectResult but does similar work
4. GetColumnData accesses ['_'] twice per column - once for data, once for notNull
5. HKT pattern in PgSelectKind adds overhead for every method call
Proposed Optimizations
Option A: Create Pg-Specific SelectResultFields
Create a version that knows it's dealing with PgColumn and skips the conditional dispatch:
// In pg-core/query-builders/select.types.ts
type PgSelectResultFields<TColumns extends Record<string, PgColumn<any>>> = {
  [K in keyof TColumns & string]: TColumns[K]['_']['notNull'] extends true
    ? TColumns[K]['_']['data']
    : TColumns[K]['_']['data'] | null;
};
Option B: Inline SelectResult for 'single' mode
For the common case where TSelectMode is 'single', skip the conditional:
// Fast path: when we know it's single-table select
type PgSelectResultSingle<TSelection extends ColumnsSelection> = 
  Simplify<SelectResultFields<TSelection>>;
Option C: Combine TResult and TSelectedFields computation
Currently computed separately in PgSelectBase:
TResult = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
TSelectedFields = BuildSubquerySelection<TSelection, TNullabilityMap>,
Could potentially share intermediate work.