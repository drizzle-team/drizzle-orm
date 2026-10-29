import { createPool, Shape } from '../src/node.ts'
import { geometry, geography } from '../src/geometry.ts'

const pool = createPool({ url: 'postgresql://postgres:postgres@127.0.0.1:55432/testdb' })

const P = (t: string) => `ST_GeomFromText('${t}')`
const eq = (label: string, got: unknown, want: unknown) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  console.log(`${g === w ? 'ok  ' : 'FAIL'} ${label.padEnd(24)} ${g}${g === w ? '' : `\n     want: ${w}`}`)
}

// the original repro: two points must both survive
{
  const r = await pool.query(`select geos, pts from repro`, [], {
    shape: Shape({ geos: geometry.array('xy'), pts: 'point[]:xy' }),
  })
  const row = r.rows[0] as unknown as Record<string, unknown>
  eq('geometry[]:xy', row.geos, [{ x: 5, y: 6 }, { x: 7, y: 8 }])
  eq('point[]:xy (control)', row.pts, [{ x: 5, y: 6 }, { x: 7, y: 8 }])
}

// NULL elements, empty arrays, geography, other targets, multi-dim, mixed types
{
  const r = await pool.query(
    `select ARRAY[${P('POINT(1 2)')}, NULL, ${P('POINT(3 4)')}]::geometry[] a,
            ARRAY[]::geometry[] b,
            ARRAY[ST_GeogFromText('POINT(1 2)'), ST_GeogFromText('POINT(3 4)')]::geography[] c,
            ARRAY[${P('POINT(1 2)')}, ${P('POINT(3 4)')}]::geometry[] d,
            ARRAY[[${P('POINT(1 2)')},${P('POINT(3 4)')}],[${P('POINT(5 6)')},${P('POINT(7 8)')}]]::geometry[] e,
            ARRAY[${P('POINT(1 2)')}, ${P('LINESTRING(0 0,1 1)')}]::geometry[] f`,
    [], {
      shape: Shape({
        a: geometry.array('tuple'), b: geometry.array('xy'), c: geography.array('xy'),
        d: geometry.array('geojson'), e: geometry.array('tuple'), f: geometry.array('geojson'),
      }),
    },
  )
  const row = r.rows[0] as unknown as Record<string, unknown>
  eq('NULL element', row.a, [[1, 2], null, [3, 4]])
  eq('empty {}', row.b, [])
  eq('geography[]:xy', row.c, [{ x: 1, y: 2 }, { x: 3, y: 4 }])
  eq('geometry[]:geojson', row.d, [{ type: 'Point', coordinates: [1, 2] }, { type: 'Point', coordinates: [3, 4] }])
  eq('multi-dim', row.e, [[[1, 2], [3, 4]], [[5, 6], [7, 8]]])
  eq('mixed geom types', row.f, [{ type: 'Point', coordinates: [1, 2] }, { type: 'LineString', coordinates: [[0, 0], [1, 1]] }])
}

// the declared-Point contract stays loud inside arrays
{
  try {
    await pool.query(`select ARRAY[${P('LINESTRING(0 0,1 1)')}]::geometry[] g`, [], {
      shape: Shape({ g: geometry.array('xy') }),
    })
    console.log('FAIL non-Point under :xy         expected a throw')
  } catch (e) {
    const loud = /expect a Point geometry, got LineString/.test(String((e as Error).message))
    console.log(`${loud ? 'ok  ' : 'FAIL'} non-Point under :xy      throws: ${(e as Error).message.slice(0, 60)}…`)
  }
}

await pool.end()
