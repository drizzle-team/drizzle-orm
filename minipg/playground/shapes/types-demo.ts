// The extended type system, end to end: builtins (point/line), pgvector, numeric:bigint,
// defineType() custom types, and PostGIS via minipg/geometry.   bun playground/shapes/types-demo.ts
import { connect, defineType, Json } from '../../src/index.ts'
import { geometry, box2d } from '../../src/geometry.ts'

const c = await connect({ path: '/tmp/minipg_sock/.s.PGSQL.54329', user: 'postgres', database: 'testdb' })
const show = async (title: string, sql: string, shape: Record<string, unknown>) => {
  const r = await c.query(sql, [], { shape: shape as never })
  console.log(`\n— ${title}`)
  console.dir(r.rows[0], { depth: 4 })
}

// 1. built-in line: {A,B,C} of Ax + By + C = 0 — bare stays raw text, targets parse
await show('line: bare / :abc / :tuple / array elements',
  `select '{1,-2,3.5}'::line raw, '{1,-2,3.5}'::line abc, '{1,-2,3.5}'::line tup,
          array['{1,-2,3.5}'::line, '{0,1,-7}'::line] arr`,
  { raw: 'line', abc: 'line:abc', tup: 'line:tuple', arr: 'line[]:abc' })

// 2. built-in point + arrays
await show('point: :xy / :tuple / point[]',
  `select '(1.5,2.5)'::point xy, '(1.5,2.5)'::point tup, array['(1,2)'::point,'(3,4)'::point] arr`,
  { xy: 'point:xy', tup: 'point:tuple', arr: 'point[]:xy' })

// 3. pgvector (::text fixtures — decode is by DECLARED name, no extension needed here)
await show('vector: :array / :f32 / vector[]',
  `select '[1,2.5,3]'::text a, '[1,2.5,3]'::text f, '{"[1,2]","[3,4]"}'::text arr`,
  { a: 'vector:array', f: 'vector:f32', arr: 'vector[]:array' })

// 4. numeric:bigint — the uint256 contract (fractional values THROW instead of truncating)
await show('numeric:bigint: 2^100 exact, arrays, inside Json',
  `select (2::numeric^100)::numeric(40,0) v, array[(2::numeric^100)::numeric(40,0), 7] arr,
          row_to_json((select x from (select (2::numeric^100)::numeric(40,0) as big) x)) j`,
  { v: 'numeric:bigint', arr: 'numeric[]:bigint', j: Json({ big: 'numeric:bigint' }) })
await c.query(`select 10.50::numeric v`, [], { shape: { v: 'numeric:bigint' } })
  .catch((e: Error) => console.log('   fractional under :bigint →', e.message))

// 5. defineType(): your own type — string targets + zero-copy rawTargets, arrays for free
const complex = defineType('complex', {
  ascii: true,
  targets: { obj: (s) => { const i = s.indexOf('+'); return { re: Number(s.slice(0, i)), im: Number(s.slice(i + 1, -1)) } } },
  rawTargets: { bytes: (b, o, l) => l },
})
await show(`defineType('complex'): obj / bare / raw tier / array`,
  `select '1.5+2i'::text o, '1.5+2i'::text bare, '1.5+2i'::text len, '{"1+2i","3+4i"}'::text arr`,
  { o: complex('obj'), bare: complex(), len: complex('bytes'), arr: complex.array('obj') })

// 6. minipg/geometry — PostGIS as a registry customer
await show('geometry: :geojson / :xy / :tuple / :wkb / array; box2d :xy',
  `select '0101000020E6100000000000000000F03F0000000000000040'::text gj,
          '0101000020E6100000000000000000F03F0000000000000040'::text xy,
          '0101000020E6100000000000000000F03F0000000000000040'::text tup,
          '0101000020E6100000000000000000F03F0000000000000040'::text wkb,
          '{"0101000020E6100000000000000000F03F0000000000000040"}'::text arr,
          'BOX(1 2,3 4)'::text b`,
  { gj: geometry('geojson'), xy: geometry('xy'), tup: geometry('tuple'), wkb: geometry('wkb'), arr: geometry.array('xy'), b: box2d('xy') })
const LINESTRING = '010200000002000000' + '0000000000000000'.repeat(2) + '000000000000F03F'.repeat(2)
await c.query(`select '${LINESTRING}'::text g`, [], { shape: { g: geometry('xy') } })
  .catch((e: Error) => console.log('   LineString under :xy →', e.message))

await c.end()
process.exit(0)
