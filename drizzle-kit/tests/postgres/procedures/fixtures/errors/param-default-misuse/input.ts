import { procedure } from 'drizzle-orm/pg-core'

procedure(
  'search_slots',
  {
    room: { type: 'bigint', default: 1 },
    day: 'text',
    limit: { type: 'int', default: 'twenty' },
    offset: { type: 'int', default: 10 * 2 },
    sort: { type: 'text' },
    page: { type: 'int', default: 1, max: 50 },
  },
  (ctx) => {},
)
