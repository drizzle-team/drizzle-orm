## Overview

drizzle-seed is a typescript library that will help you generate deterministic fake realistic data and fill your database with it.

### Determinism

##

#### pseudorandom number generator(pRNG)

It's a random number generator whose randomness you can control.
It will give you the same sequence of numbers if you initialize it with the same `seed` number.

##

#### How it works?

Each column will be assigned with its generator and all random events in it will be handled by pRNG.

Each pRNG will be initialized with `seed` which will be generated from table name and column name.

Also, there will be cases when the randomness of generators will be affected by the number of rows you want to generate. So far this only applies to unique int and number generators.

So as long as your schema and your seeding script remain the same, Seeder will generate the same data.

## Getting started

`npm install drizzle-seed`

You have to install drizzle-orm in order to use seeder.

`npm install drizzle-orm`

## Usage

### Simple usage

#### `src/main.ts`

```ts
(async () => {
  await seed(db, schema);
  // await seed(db, schema, { count: 100000 });
  // await seed(db, schema, { count: 100000, seed: 1 });
})().then();
```

From the commented part of the code above, you can see that it's possible to specify the `count` property which stands for the number of rows you want to generate

and `seed` property which represents a custom `seed` number that will be added to the one automatically generated from the table's name and column's name and then the result of addition will be fed to pRNG.
Therefore you can manage different states of your data using the `seed` property.

#### You also can delete all data from your tables to seed your database again using the `reset` function.

#### `src/main.ts`

```ts
(async () => {
  await reset(db, schema);
  // await seed(db, schema);
})().then();
```

`If db is a PgDatabase object`, we will execute sql query and delete data from your tables the following way:

```sql
truncate tableName1, tableName2, ... cascade;
```

`If db is a MySqlDatabase object`, we will execute sql queries and delete data from your tables the following way:

```sql
SET FOREIGN_KEY_CHECKS = 0;
truncate tableName1;
truncate tableName2;
.
.
.

SET FOREIGN_KEY_CHECKS = 1;
```

`If db is a BaseSQLiteDatabase object`, we will execute sql queries and delete data from your tables the following way:

```sql
PRAGMA foreign_keys = OFF;
delete from tableName1;
delete from tableName2;
.
.
.

PRAGMA foreign_keys = ON;
```

### But you still need to define database schema (`schema`) and create database connection (`db`) before using `seed` or `reset` function.

#### You can find some examples for Postgres, Mysql and Sqlite below.

### **Postgres**

#### `src/schema.ts`

```ts
import {
  serial,
  integer,
  varchar,
  pgSchema,
  getTableConfig as getPgTableConfig,
} from "drizzle-orm/pg-core";

export const schema = pgSchema("seeder_lib_pg");

export const users = schema.table("users", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 256 }),
  email: varchar("email", { length: 256 }),
  phone: varchar("phone", { length: 256 }),
  password: varchar("password", { length: 256 }),
});

export const posts = schema.table("posts", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 256 }),
  content: varchar("content", { length: 256 }),
  userId: integer("user_id").references(() => users.id),
});
```

#### `src/main.ts`

```ts
import Pool from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const { PG_HOST, PG_PORT, PG_DATABASE, PG_USER, PG_PASSWORD } = process.env;

const pool = new Pool({
  host: PG_HOST,
  port: Number(PG_PORT) || 5432,
  database: PG_DATABASE,
  user: PG_USER,
  password: PG_PASSWORD,
  // ssl: true
});

const db = drizzle(pool);
```

### **Mysql**

#### `src/schema.ts`

```ts
import { serial, int, varchar, mysqlTable } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 256 }),
  email: varchar("email", { length: 256 }),
  phone: varchar("phone", { length: 256 }),
  password: varchar("password", { length: 256 }),
});

export const posts = mysqlTable("posts", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 256 }),
  content: varchar("content", { length: 256 }),
  userId: int("user_id").references(() => users.id),
});
```

#### `src/main.ts`

```ts
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "./schema";

const { Mysql_HOST, Mysql_PORT, Mysql_DATABASE, Mysql_USER, Mysql_PASSWORD } =
  process.env;

const pool = mysql.createPool({
  host: Mysql_HOST,
  port: Number(Mysql_PORT) || 3306,
  database: Mysql_DATABASE,
  user: Mysql_USER,
  password: Mysql_PASSWORD,
  // ssl: { rejectUnauthorized: false }
});

const db = drizzle(pool);
```

### **Sqlite**

#### `src/schema.ts`

```ts
import { integer, text, sqliteTable } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey(),
  name: text("name", { length: 256 }),
  email: text("email", { length: 256 }),
  phone: text("phone", { length: 256 }),
  password: text("password", { length: 256 }),
});

export const posts = sqliteTable("posts", {
  id: integer("id").primaryKey(),
  title: text("title", { length: 256 }),
  content: text("content", { length: 256 }),
  userId: integer("user_id").references(() => users.id),
});
```

#### `src/main.ts`

```ts
import betterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const { Sqlite_PATH } = process.env;
const sqliteDb = betterSqlite3(Sqlite_PATH);
const db = drizzle(sqliteDb);
```

### More complex usage examples

#### All of the following examples will be in the context of database schema defined above.

##

#### You have 30 different data generators to choose from:

- `default`
- `valuesFromArray`
- `intPrimaryKey`
- `number`
- `int`
- `boolean`
- `date`
- `time`
- `timestamp`
- `datetime`
- `year`
- `json`
- `interval`
- `string`
- `firstName`
- `lastName`
- `fullName`
- `email`
- `phoneNumber`
- `country`
- `city`
- `streetAddress`
- `jobTitle`
- `postcode`
- `state`
- `companyName`
- `loremIpsum`
- `weightedRandom`

#### Some of them have an option to generate unique data samples which stands for property `isUnique`.

#### Some of them can only generate unique data like `email` or `phoneNumber` generators.

#### `src/main.ts`

```ts
(async () => {
  await seed(db, schema, { count: 1000 }).refine((funcs) => ({
    users: {
      columns: {
        name: funcs.firstName({ isUnique: true }),
        email: funcs.email(),
        phone: funcs.phoneNumber({ template: "+380 99 ###-##-##" }),
        password: funcs.string({ isUnique: true }),
      },
      count: 100000,
    },
    posts: {
      columns: {
        title: funcs.valuesFromArray({
          values: ["Title1", "Title2", "Title3", "Title4", "Title5"],
        }),
        content: funcs.loremIpsum({ sentencesCount: 3 }),
      },
    },
  }));
})().then();
```

In the example above we used <br />
`firstName`, `string` generators that have `isUnique` property,<br />
`email` and `phoneNumber` which always generates unique data,<br />
`loremIpsum` and `default` generators that don't have `isUnique` property,<br />
and `valuesFromArray` which has `isUnique` property.

Also we specified number of rows we want to generate in `users` section using property `count`. Therefore top-level `count` which equals 1000, will be rewrote with the one from `refine` and `count` for `users` table will equal 100000.

And since we didn't specify `count` property in `posts` section it will use top-level `count` which equals 1000 and generate 1000 rows for `posts` table.

#### Even so `valuesFromArray` generator has `isUnique` property, there is no point using it here, since we have only 5 unique elements in `values` array and want to generate 1000 titles for `posts` table.

##

#### You can specify how many posts each user will have, using `with` property if there is right relation in schema.

#### Write `with: {posts: 2}` so each user will have 2 posts related to him.

#### `src/main.ts`

```ts
(async () => {
  await seed(db, schema, { count: 1000 }).refine((funcs) => ({
    users: {
      count: 100000,
      with: {
        posts: 2,
      },
    },
    posts: {
      count: 100,
    },
  }));
})().then();
```

In this example overall number of posts or in other words posts `count` will be calculated like:

{users `count`} $\times$ 2 = 100000 $\times$ 2 = 200000

And this posts `count` will overwrite both top-level `count` which equals to 100000 and `count` from `posts` section which equals to 100.

##

#### **Weighted choice**

#### You can specify weighted number of posts for each user to have.

```ts
with: {
  posts: [
    { weight: 0.7, count: 3 },
    { weight: 0.3, count: [4, 5] }
  ]
}
```

#### This means that each user will have 3 posts with probability 0.7 and from 4 to 5 posts with probability 0.3 .

Number of posts for each user will be generated using pRNG and therefore remain deterministic.

#### There also are some generators that feature select with given probability:

- `valuesFromArray` has option to specify weighted arrays of values,
- `weightedMix` will use generators with given probabilities.

#### `src/main.ts`

```ts
(async () => {
  await seed(db, schema).refine((funcs) => ({
    users: {
      count: 100000,
      with: {
        posts: [
          { weight: 0.7, count: 3 },
          { weight: 0.3, count: [4, 5] },
        ],
      },
    },
    posts: {
      columns: {
        title: funcs.valuesFromArray({
          values: [
            { weight: 0.35, values: ["Title1", "Title2"] },
            { weight: 0.5, values: ["Title3", "Title4"] },
            { weight: 0.15, values: ["Title5"] },
          ],
        }),
        content: funcs.weightedRandom([
          {
            weight: 0.6,
            value: funcs.loremIpsum({ sentencesCount: 3 }),
          },
          {
            weight: 0.4,
            value: funcs.default({ defaultValue: "TODO" }),
          },
        ]),
      },
    },
  }));
})().then();
```

#### Explanations of the code block above:

- `valuesFromArray` generator <br />
  with probability 0.35 will pick array `["Title1", "Title2"]`, <br />
  with probability 0.5 will pick array `["Title3", "Title4"]`, <br />
  with probability 0.15 will pick array `["Title5"]` <br />
  and then pick value from chosen array using uniform distribution or in other words uniformly.
- `weightedMix` generator will call `loremIpsum` generator with probability 0.6 and `default` generator with probability 0.4 .

##

#### And you can combine all of this in one seeding script

#### `src/main.ts`

```ts
(async () => {
  await seed(db, schema).refine((funcs) => ({
    users: {
      columns: {
        name: funcs.fullName(),
        email: funcs.email(),
        phone: funcs.phoneNumber({ template: "+380 99 ###-##-##" }),
        password: funcs.string({ isUnique: true }),
      },
      count: 100000,
      with: {
        posts: [
          { weight: 0.7, count: 3 },
          { weight: 0.3, count: [4, 5] },
        ],
      },
    },
    posts: {
      columns: {
        title: funcs.valuesFromArray({
          values: [
            { weight: 0.35, values: ["Title1", "Title2"] },
            { weight: 0.5, values: ["Title3", "Title4"] },
            { weight: 0.15, values: ["Title5"] },
          ],
        }),
        content: funcs.weightedRandom([
          {
            weight: 0.6,
            value: funcs.loremIpsum({ sentencesCount: 3 }),
          },
          {
            weight: 0.4,
            value: funcs.default({ defaultValue: "TODO" }),
          },
        ]),
      },
    },
  }));
})().then();
```

### Generators Usage Examples

##

#### **default**

generates same given value each time the generator is called.

`defaultValue` - value you want to generate

```ts
await seed(db, schema, { count: 1000 }).refine((funcs) => ({
  posts: {
    columns: {
      content: funcs.default({ defaultValue: "post content" }),
    },
  },
}));
```

##

#### **valuesFromArray**

generates values from given array

`values` - array of values you want to generate.(can be array of weighted values)

`isUnique` - property that controls if generated values gonna be unique or not.

```ts
await seed(db, schema, { count: 1000 }).refine((funcs) => ({
  posts: {
    columns: {
      title: funcs.valuesFromArray({
        values: ["Title1", "Title2", "Title3", "Title4", "Title5"],
        isUnique: true,
      }),
    },
  },
}));
```

weighted values example

```ts
await seed(db, schema, { count: 1000 }).refine((funcs) => ({
  posts: {
    columns: {
      title: funcs.valuesFromArray({
        values: [
          { weight: 0.35, values: ["Title1", "Title2"] },
          { weight: 0.5, values: ["Title3", "Title4"] },
          { weight: 0.15, values: ["Title5"] },
        ],
        isUnique: false,
      }),
    },
  },
}));
```

##

#### **intPrimaryKey**

generates sequential integers starting with 1.

```ts
await seed(db, schema, { count: 1000 }).refine((funcs) => ({
  posts: {
    columns: {
      id: funcs.intPrimaryKey(),
    },
  },
}));
```

##

#### **number**

generates numbers with floating point in given range.

`minValue` - lower border of range.

`maxValue` - upper border of range.

`precision` - precision of generated number:<br/>
precision equals 10 means that values will be accurate to one tenth (1.2, 34.6);<br/>
precision equals 100 means that values will be accurate to one hundredth (1.23, 34.67).

`isUnique` - property that controls if generated values gonna be unique or not.

```ts
await seed(db, schema, { count: 1000 }).refine((funcs) => ({
  products: {
    columns: {
      unitPrice: funcs.number({
        minValue: 10,
        maxValue: 120,
        precision: 100,
        isUnique: false,
      }),
    },
  },
}));
```

##

#### **int**

generates integers with given range.

`minValue` - lower border of range.

`maxValue` - upper border of range.

`isUnique` - property that controls if generated values gonna be unique or not.

```ts
await seed(db, schema, { count: 1000 }).refine((funcs) => ({
  products: {
    columns: {
      unitsInStock: funcs.int({
        minValue: 0,
        maxValue: 100,
        isUnique: false,
      }),
    },
  },
}));
```

##

#### **boolean**

generates boolean values(true or false).

```ts
await seed(db, schema, { count: 1000 }).refine((funcs) => ({
  users: {
    columns: {
      isAvailable: funcs.boolean(),
    },
  },
}));
```

##

#### **date**

generates date within given range.

`minDate` - lower border of range.

`maxDate` - upper border of range.

```ts
await seed(db, schema, { count: 1000 }).refine((funcs) => ({
  users: {
    columns: {
      birthDate: funcs.date({ minDate: "1990-01-01", maxDate: "2010-12-31" }),
    },
  },
}));
```

##

#### **time**

generates time in 24 hours style.

```ts
await seed(db, schema, { count: 1000 }).refine((funcs) => ({
  users: {
    columns: {
      birthTime: funcs.time(),
    },
  },
}));
```

##

#### **timestamp**

generates timestamps.

```ts
await seed(db, schema, { count: 1000 }).refine((funcs) => ({
  orders: {
    columns: {
      shippedDate: funcs.timestamp(),
    },
  },
}));
```

##

#### **datetime**

generates datetime objects.

```ts
await seed(db, schema, { count: 1000 }).refine((funcs) => ({
  orders: {
    columns: {
      shippedDate: funcs.datetime(),
    },
  },
}));
```

##

#### **year**

generates years.

example of generated value: "2024"

```ts
await seed(db, schema, { count: 1000 }).refine((funcs) => ({
  users: {
    columns: {
      birthYear: funcs.year(),
    },
  },
}));
```

##

#### **json**

generates json objects with fixed structure.

json structure can equal this:

```
{
    email,
    name,
    isGraduated,
    hasJob,
    salary,
    startedWorking,
    visitedCountries,
}
```

or this

```
{
    email,
    name,
    isGraduated,
    hasJob,
    visitedCountries,
}
```

```ts
await seed(db, schema, { count: 1000 }).refine((funcs) => ({
  users: {
    columns: {
      metadata: funcs.json(),
    },
  },
}));
```

##

#### **interval**

generates time intervals.

example of generated value: "1 years 12 days 5 minutes"

`isUnique` - property that controls if generated values gonna be unique or not.

```ts
await seed(db, schema, { count: 1000 }).refine((funcs) => ({
  users: {
    columns: {
      timeSpentOnWebsite: funcs.interval(),
    },
  },
}));
```

##

#### **string**

generates random strings.

`isUnique` - property that controls if generated values gonna be unique or not.

```ts
await seed(db, schema, { count: 1000 }).refine((funcs) => ({
  users: {
    columns: {
      hashedPassword: funcs.string({ isUnique: false }),
    },
  },
}));
```

##

#### **firstName**

generates person's first names.

`isUnique` - property that controls if generated values gonna be unique or not.

```ts
await seed(db, schema, { count: 1000 }).refine((funcs) => ({
  users: {
    columns: {
      firstName: funcs.firstName({ isUnique: true }),
    },
  },
}));
```

##

#### **lastName**

generates person's last names.

`isUnique` - property that controls if generated values gonna be unique or not.

```ts
await seed(db, schema, { count: 1000 }).refine((funcs) => ({
  users: {
    columns: {
      lastName: funcs.lastName({ isUnique: false }),
    },
  },
}));
```

##

#### **fullName**

generates person's full names.

`isUnique` - property that controls if generated values gonna be unique or not.

```ts
await seed(db, schema, { count: 1000 }).refine((funcs) => ({
  users: {
    columns: {
      fullName: funcs.fullName({ isUnique: true }),
    },
  },
}));
```

##

#### **email**

generates unique emails.

```ts
await seed(db, schema, { count: 1000 }).refine((funcs) => ({
  users: {
    columns: {
      email: funcs.email(),
    },
  },
}));
```

##

#### **phoneNumber**

generates unique phone numbers.

`template` - phone number template, where all '#' symbols will be substituted with generated digits.

`prefixes` - array of any string you want to be your phone number prefixes.(not compatible with `template` property)

`generatedDigitsNumbers` - number of digits that will be added at the end of prefixes.(not compatible with `template` property)

```ts
//generate phone number using template property
await seed(db, schema, { count: 1000 }).refine((funcs) => ({
  users: {
    columns: {
      phoneNumber: funcs.phoneNumber({ template: "+(380) ###-####" }),
    },
  },
}));

//generate phone number using prefixes and generatedDigitsNumbers properties
await seed(db, schema, { count: 1000 }).refine((funcs) => ({
  users: {
    columns: {
      phoneNumber: funcs.phoneNumber({
        prefixes: ["+380 99", "+380 67"],
        generatedDigitsNumbers: 7,
      }),
    },
  },
}));

//generate phone number using prefixes and generatedDigitsNumbers properties but with different generatedDigitsNumbers for prefixes
await seed(db, schema, { count: 1000 }).refine((funcs) => ({
  users: {
    columns: {
      phoneNumber: funcs.phoneNumber({
        prefixes: ["+380 99", "+380 67", "+1"],
        generatedDigitsNumbers: [7, 7, 10],
      }),
    },
  },
}));
```

##

#### **country**

generates country's names.

`isUnique` - property that controls if generated values gonna be unique or not.

```ts
await seed(db, schema, { count: 1000 }).refine((funcs) => ({
  users: {
    columns: {
      country: funcs.country({ isUnique: false }),
    },
  },
}));
```

##

#### **city**

generates city's names.

`isUnique` - property that controls if generated values gonna be unique or not.

```ts
await seed(db, schema, { count: 1000 }).refine((funcs) => ({
  users: {
    columns: {
      city: funcs.city({ isUnique: false }),
    },
  },
}));
```

##

#### **streetAddress**

generates street address.

`isUnique` - property that controls if generated values gonna be unique or not.

```ts
await seed(db, schema, { count: 1000 }).refine((funcs) => ({
  users: {
    columns: {
      streetAddress: funcs.streetAddress({ isUnique: true }),
    },
  },
}));
```

##

#### **jobTitle**

generates job titles.

```ts
await seed(db, schema, { count: 1000 }).refine((funcs) => ({
  users: {
    columns: {
      jobTitle: funcs.jobTitle(),
    },
  },
}));
```

##

#### **postcode**

generates postal codes.

`isUnique` - property that controls if generated values gonna be unique or not.

```ts
await seed(db, schema, { count: 1000 }).refine((funcs) => ({
  users: {
    columns: {
      postcode: funcs.postcode({ isUnique: true }),
    },
  },
}));
```

##

#### **state**

generates states of America.

```ts
await seed(db, schema, { count: 1000 }).refine((funcs) => ({
  users: {
    columns: {
      state: funcs.state(),
    },
  },
}));
```

##

#### **companyName**

generates company's names.

`isUnique` - property that controls if generated values gonna be unique or not.

```ts
await seed(db, schema, { count: 1000 }).refine((funcs) => ({
  users: {
    columns: {
      company: funcs.companyName({ isUnique: true }),
    },
  },
}));
```

##

#### **loremIpsum**

generates 'lorem ipsum' text sentences.

`sentencesCount` - number of sentences you want to generate as one generated value(string).

```ts
await seed(db, schema, { count: 1000 }).refine((funcs) => ({
  posts: {
    columns: {
      content: funcs.loremIpsum({ sentencesCount: 2 }),
    },
  },
}));
```

##

#### **point**

generates 2D points within specified ranges for x and y coordinates.

`isUnique` - property that controls if generated values gonna be unique or not.

`minXValue` - lower bound of range for x coordinate.

`maxXValue` - upper bound of range for x coordinate.

`minYValue` - lower bound of range for y coordinate.

`maxYValue` - upper bound of range for y coordinate.

```ts
await seed(db, schema, { count: 1000 }).refine((funcs) => ({
  triangles: {
    columns: {
      pointCoords: funcs.point({
        isUnique: true,
        minXValue: -5,
        maxXValue: 20,
        minYValue: 0,
        maxYValue: 30,
      }),
    },
  },
}));
```

##

#### **line**

generates 2D lines within specified ranges for a, b and c parameters of line.

```
line equation: a*x + b*y + c = 0
```

`isUnique` - property that controls if generated values gonna be unique or not.

`minAValue` - lower bound of range for a parameter.

`maxAValue` - upper bound of range for x parameter.

`minBValue` - lower bound of range for y parameter.

`maxBValue` - upper bound of range for y parameter.

`minCValue` - lower bound of range for y parameter.

`maxCValue` - upper bound of range for y parameter.

```ts
await seed(db, schema, { count: 1000 }).refine((funcs) => ({
  lines: {
    columns: {
      lineParams: funcs.point({
        isUnique: true,
        minAValue: -5,
        maxAValue: 20,
        minBValue: 0,
        maxBValue: 30,
        minCValue: 0,
        maxCValue: 10,
      }),
    },
  },
}));
```

##

#### **weightedRandom**

gives you the opportunity to call different generators with different probabilities to generate values for one column.

params - array of generators with probabilities you would like to call them to generate values.

```ts
await seed(db, schema, { count: 1000 }).refine((funcs) => ({
  posts: {
    columns: {
      content: funcs.weightedRandom([
        {
          weight: 0.6,
          value: funcs.loremIpsum({ sentencesCount: 3 }),
        },
        {
          weight: 0.4,
          value: funcs.default({ defaultValue: "TODO" }),
        },
      ]),
    },
  },
}));
```

##

## Limitations

- Seeder can generate data for composite foreign keys, but it can't handle the uniqueness of composite primary keys, so using composite primary and foreign keys sometimes will end up in error for now.
- Seeder can't generate data for columns with composite unique constraint.(unique index for multiple columns)
- Not all generators have ability to generate unique data. This applies to default, date, time, timestamp, datetime, year, json, jobTitle, state, loremIpsum generators.
