// Public Shape API: declare a row shape by column name -> PG type (optionally with a
// `:number`/`:string` JS-target override), or a nested Json()/JsonArray() shape. Get back a
// callable mapper compiled via the same codegen the driver uses, with `$printMapper()` to
// inspect the generated function and `$source` to read it.
//
//   const user = Shape({
//     id: 'int4',
//     big: 'int8',                                   // -> exact string (precise)
//     views: 'int8:number',                          // -> JS number (you assert <= 2^53)
//     subscription: Json({ id: 'int4', price: 'numeric' }),          // json, declared order
//     invoices: JsonArray({ id: 'int8', total: 'numeric' }),        // json_agg array
//     prefs: Jsonb({ a: 'int8', b: 'numeric' }),                   // jsonb: read in sorted order
//   })
//   user.$printMapper()              // prints the generated decoder
//   const rows = user(dataRowBodies) // decode an array of DataRow bodies -> rows[]
import { compileResultSet, type CodegenCol } from './decode.ts'
import { buildDecoders } from './decode.ts'
import { shapeCols, type ShapeSpec, type ShapeOf, type ShapeEntries } from './spec.ts'

export type { ShapeSpec }
export interface ShapeMapper {
  /** Decode all DataRow bodies of a result set into rows (object or array per `mode`). */
  (rows: Buffer[]): unknown[]
  /** The generated mapper source (the JIT mapper over the whole result set). */
  readonly $source: string
  /** The resolved columns (name + OID + overrides). */
  readonly $cols: ReadonlyArray<CodegenCol>
  /** Return the generated mapper source (for pretty/colorize/inspection). */
  $mapper(): string
  /** Print the generated mapper to stdout. */
  $printMapper(): void
}

/** Build a callable, codegen-compiled whole-result-set mapper from a declared shape.
 *  Generic over the column names so editors autocomplete each value to the known type list. */
export function Shape<K extends string>(spec: ShapeOf<K> | ShapeEntries, mode: 'object' | 'array' = 'object'): ShapeMapper {
  const cols: CodegenCol[] = shapeCols(spec as ShapeSpec)
  const mapper = compileResultSet(cols, mode, buildDecoders())
  const fn = ((rows: Buffer[]) => mapper(rows)) as ShapeMapper
  Object.defineProperties(fn, {
    $source: { value: mapper.source, enumerable: false },
    $cols: { value: cols, enumerable: false },
    $mapper: { value: () => mapper.source, enumerable: false },
    $printMapper: { value: () => console.log(mapper.source), enumerable: false },
  })
  return fn
}
