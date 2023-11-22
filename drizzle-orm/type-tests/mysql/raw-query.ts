import { sql } from '~/sql/sql.ts';
import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import { db } from './db.ts';
import { cities, users } from './tables.ts';
import type { FieldPacket, ResultSetHeader } from 'mysql2/promise';

const select = await db.execute<{ id: number, name: string, population: number | null }>(sql`
  SELECT ${cities.id}, ${cities.name}, ${cities.population} from ${cities}
`)
Expect<
    Equal<
        [
            {
                id: number;
                name: string;
                population: number | null;
            }[],
            FieldPacket[]
        ],
        typeof select
    >
>;

const insert = await db.execute(sql`
  INSERT INTO ${cities} (${cities.name}) VALUES('Tokyo')
`)
Expect<
    Equal<
        [
            ResultSetHeader,
            FieldPacket[]
        ],
        typeof insert
    >
>;

const update = await db.execute(sql`
  UPDATE ${cities} SET ${cities.name}) = 'London' WHERE ${cities.id} = 1
`)
Expect<
    Equal<
        [
            ResultSetHeader,
            FieldPacket[]
        ],
        typeof update
    >
>;

const insertSelect = await db.execute<[ResultSetHeader, { id: number, name: string, population: number | null }]>(sql`
  INSERT INTO ${cities} (${cities.name}) VALUES('New York');
  SELECT ${cities.id}, ${cities.name}, ${cities.population} from ${cities};
`)
Expect<
    Equal<
        [
            [
                ResultSetHeader,
                {
                    id: number;
                    name: string;
                    population: number | null;
                }[]
            ],
            FieldPacket[]
        ],
        typeof insertSelect
    >
>;

const selectInsert = await db.execute<[{ id: number, name: string, population: number | null }, ResultSetHeader]>(sql`
  SELECT ${cities.id}, ${cities.name}, ${cities.population} from ${cities};   
  INSERT INTO ${cities} (${cities.name}) VALUES('Osaka');
`)
Expect<
    Equal<
        [
            [
                {
                    id: number;
                    name: string;
                    population: number | null;
                }[],
                ResultSetHeader
            ],
            FieldPacket[]
        ],
        typeof selectInsert
    >
>;

const selectSelect = await db.execute<[
    { id: number, name: string, population: number | null },
    { id: number, class: 'A' | 'C', subClass: 'B' | 'D' | null }
]>(sql`
  SELECT ${cities.id}, ${cities.name}, ${cities.population} from ${cities};   
  SELECT ${users.id}, ${users.class}, ${users.subClass} from ${users};
`)
Expect<
    Equal<
        [
            [
                {
                    id: number;
                    name: string;
                    population: number | null;
                }[],
                {
                    id: number;
                    class: 'A' | 'C';
                    subClass: 'B' | 'D' | null;
                }[],
            ],
            FieldPacket[]
        ],
        typeof selectSelect
    >
>;

const insertUpdate = await db.execute<[ResultSetHeader, ResultSetHeader]>(sql`

  INSERT INTO ${cities} (${cities.name}) VALUES ('Oxfrod');
  UPDATE ${cities} SET ${cities.name}) = 'Oxford' WHERE ${cities.name} = 'Oxfrod';
`)
Expect<
    Equal<
        [
            [
                ResultSetHeader,
                ResultSetHeader
            ],
            FieldPacket[]
        ],
        typeof insertUpdate
    >
>;