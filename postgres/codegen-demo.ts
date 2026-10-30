// Demo: the library's Shape API (whole-result-set codegen mapper), pretty-printed and
// syntax-highlighted for the terminal. No hand-rolled bytes / Function.
//   bun codegen-demo.ts        (or: bun run demo:codegen)
import { highlight } from 'cli-highlight'
import prettier from 'prettier'
import { JsonArray, Shape, connect } from './src/index.ts'

const pretty = (src: string) => prettier.format(src, { parser: 'babel', semi: false, singleQuote: true, printWidth: 100 })
const colorize = (src: string) => highlight(src, { language: 'javascript', ignoreIllegals: true })
const show = async (src: string) => console.log(colorize(await pretty(src))) // prettier first (can't parse ANSI), then colorize

// 1) Declare a shape, inspect its generated result-set mapper — pure library API.
const user = Shape({
  id: 'int4', name: 'text', active: 'bool', balance: 'numeric', date: 'date',
  big: 'int8:number', meta: 'jsonb', avatar: 'bytea',
  subscriptions: JsonArray({ id: "int4",  })
})
console.log('# Shape({...}).$mapper()  — object mode, maps ALL rows:\n')
await show(user.$mapper())

// 2) Run a matching query through the real driver (same codegen path, real wire bytes).
//    Needs the local cluster: `bun run test:setup`.
try {
  const conn = await connect({ host: '127.0.0.1', port: 54329, user: 'postgres', password: 'postgres', database: 'testdb' })
  const r = await conn.query(
    `select g::int4 as id, ('alice' || g)::text as name, (g % 2 = 0) as active, (g * 1.5)::numeric as balance,
            (9007199254740990 + g)::int8 as big, jsonb_build_object('g', g) as meta, '\\xdeadbeef'::bytea as avatar
     from generate_series(1, 3) g`,
    [], { mode: 'object' },
  )
  console.log('\n# Driver-decoded rows (same codegen, real wire bytes):')
  console.dir(r.rows, { depth: null })
  await conn.end()
} catch (e) {
  console.log('\n(live query skipped — run `bun run test:setup` first):', (e as Error).message)
}
process.exit(0)
