import { connect, Collect, CollectNullable } from '../../src/index.ts'
const c = await connect({ path: '/tmp/minipg_sock/.s.PGSQL.54329', user: 'postgres', database: 'testdb' })

// users ⟕ addresses ⟕ plans — two LEFT JOIN misses to show both group behaviors
const sql = `
  select u.id, u.name,do 
         a.city, a.zip,          -- address: CollectNullable -> null on miss
         p.tier, p.seats         -- plan: plain Collect -> object with null fields on miss
  from (values (1, 'alex'), (2, 'mira')) u(id, name)
  left join (values (1, 'berlin', '10115')) a(uid, city, zip) on a.uid = u.id
  left join (values (1, 'pro', 5)) p(uid, tier, seats) on p.uid = u.id`

const r = await c.query(sql, [], { shape: {
  user: Collect({
    id: 'int4', name: 'text',
    address: CollectNullable({ city: 'text', zip: 'text' }),  // nested, auto-nulls on join miss
    plan: Collect({ tier: 'text', seats: 'int4' }),           // nested, always an object
  }),
} })
console.dir(r.rows, { depth: 5 })
await c.end()
