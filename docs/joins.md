# Drizzle ORM - Joins

As with other parts of Drizzle ORM, the joins syntax is a balance between the SQL-likeness and type safety.
Here's an example of how a common "one-to-many" relationship can be modelled.

```typescript
const users = pgTable('users', {
  id: serial('id').primaryKey(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name'),
  cityId: int('city_id').references(() => cities.id),
});

const cities = pgTable('cities', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
});
```

Now, let's select all cities with all users that live in that city.

This is how you'd write it in raw SQL:

```sql
select
  cities.id as city_id,
  cities.name as city_name,
  users.id as user_id,
  users.first_name,
  users.last_name
from cities
left join users on users.city_id = cities.id
```

And here's how to do the same with Drizzle ORM:

```typescript
const rows = await db
  .select({
      cityId: cities.id,
      cityName: cities.name,
      userId: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
    })
  .from(cities)
  .leftJoin(users, eq(users.cityId, cities.id));
```

`rows` will have the following type:

```typescript
{
  cityId: number;
  cityName: string;
  userId: number | null;
  firstName: string | null;
  lastName: string | null;
}[]
```

As you can see, all the joined columns have been nullified. This might do the trick if you're using joins to form a single row of results, but in our case we have two separate entities in our row - a city and a user.
It might not be very convenient to check every field for nullability separately (or, even worse, just add an `!` after every field to "make compiler happy"). It would be much more useful if you could somehow run a single check
to verify that the user was joined and all of its fields are available.

**To achieve that, you can group the fields of a certain table in a nested object inside of `.select()`:**

```typescript
const rows = await db
  .select({
    cityId: cities.id,
    cityName: cities.name,
    user: {
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
    },
  })
  .from(cities)
  .leftJoin(users, eq(users.cityId, cities.id));
```

In that case, the ORM will use dark TypeScript magic (as if it wasn't already) and figure out that you have a nested object where all the fields belong to the same table. So, the `rows` type will now look like this:

```typescript
{
  cityId: number;
  cityName: string;
  user: {
    id: number;
    firstName: string;
    lastName: string | null;
  } | null;
}
```

This is much more convenient! Now, you can just do a single check for `row.user !== null`, and all the user fields will become available.

---

Note that you can group any fields in a nested object however you like, but the single check optimization will only be applied to a certain nested object if all its fields belong to the same table.
So, for example, you can group the city fields, too:

```typescript
.select({
  city: {
    id: cities.id,
    name: cities.name,
  },
  user: {
    id: users.id,
    firstName: users.firstName,
    lastName: users.lastName,
  },
})
```

And the result type will look like this:

```typescript
{
  city: {
    id: number;
    name: string;
  };
  user: {
    id: number;
    firstName: string;
    lastName: string | null;
  } | null;
}
```

---

If you just need all the fields from all the tables you're selecting and joining, you can simply omit the argument of the `.select()` method altogether:

```typescript
const rows = await db.select().from(cities).leftJoin(users, eq(users.cityId, cities.id));
```

> [!NOTE]
> In this case, the Drizzle table/column names will be used as the keys in the result object.

```typescript
{
  cities: {
    id: number;
    name: string;
  };
  users: {
    id: number;
    firstName: string;
    lastName: string | null;
    cityId: number | null;
  } | null;
}[]
```

---

There are cases where you'd want to select all the fields from one table, but pick fields from others. In that case, instead of listing all the table fields, you can just pass a table:

```typescript
.select({
  cities, // shorthand for "cities: cities", the key can be anything
  user: {
    firstName: users.firstName,
  },
})
```

```typescript
{
  cities: {
    id: number;
    name: string;
  };
  user: {
    firstName: string;
  } | null;
}
```

---

But what happens if you group columns from multiple tables in the same nested object? Nothing, really - they will still be all individually nullable, just grouped under the same object (as you might expect!):

```typescript
.select({
  id: cities.id,
  cityAndUser: {
    cityName: cities.name,
    userId: users.id,
    firstName: users.firstName,
    lastName: users.lastName,
  }
})
```

```typescript
{
  id: number;
  cityAndUser: {
    cityName: string;
    userId: number | null;
    firstName: string | null;
    lastName: string | null;
  };
}
```

## Aggregating results

OK, so you have obtained all the cities and the users for every city. But what you **really** wanted is a **list** of users for every city, and what you currently have is an array of `city-user?` combinations. So, how do you transform it?
That's the neat part - you can do that however you'd like! No hand-holding here.

For example, one of the ways to do that would be `Array.reduce()`:

```typescript
import { InferModel } from 'drizzle-orm';

type User = InferModel<typeof users>;
type City = InferModel<typeof cities>;

const rows = await db
  .select({
    city: cities,
    user: users,
  })
  .from(cities)
  .leftJoin(users, eq(users.cityId, cities.id));

const result = rows.reduce<Record<number, { city: City; users: User[] }>>(
  (acc, row) => {
    const city = row.city;
    const user = row.user;

    if (!acc[city.id]) {
      acc[city.id] = { city, users: [] };
    }

    if (user) {
      acc[city.id].users.push(user);
    }

    return acc;
  },
  {},
);
```
