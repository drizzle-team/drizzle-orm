# DrizzleORM

**DrizzleORM** is an ORM framework for 
[TypeScript](https://www.typescriptlang.org/).
It offers you several levels of Database communication:
* Typesafe Table View approach 
* Typesafe Query Builder
* Simple SQL query execution

Drizzle ORM is highly influenced by [Exposed](https://github.com/JetBrains/Exposed) and Jetbrains development methodology

## Supported Databases

* PostgreSQL

## Links

In Progress

## Installing

```bash
npm install drizzle-orm drizzle-kit
yarn add drizzle-orm drizzle-kit
bower install drizzle-orm drizzle-kit
```

## Connecting to database

```tsx
import { DbConnector } from "drizzle-orm";

// connect via postgresql connection url
const db = await new DbConnector()
	.connectionString("postgres://user:password@host:port/db")
	.connect();

// or by params
const db = await new DbConnector()
	.params({
		host: '0.0.0.0',
		port: 5432,
		user: 'user',
		password: 'password',
		db: 'optional_db_name'
	}).connect();
```
## Project structure
- tables folder
- migrations folder

## Create tables
### Users Table
---
```typescript

export const rolesEnum = createEnum({ alias: 'test-enum', values: ['user', 'guest', 'admin'] });

export default class UsersTable extends AbstractTable<UsersTable> {
  public id = this.int('id').autoIncrement().primaryKey();
  public fullName = this.text('full_name');

  public phone = this.varchar('phone', { size: 256 });
  public media = this.jsonb<string[]>('media');
  public decimalField = this.decimal('test', { notNull: true, precision: 100, scale: 2 });
  public bigIntField = this.bigint('test1');
  public role = this.type(rolesEnum, 'name_in_table', { notNull: true });

  public createdAt = this.timestamp('created_at', { notNull: true });
  public updatedAt = this.timestamp('updated_at');
  public isArchived = this.bool('is_archived').defaultValue(false);

  public phoneFullNameIndex = this.index([this.phone, this.fullName]);
  public phoneIndex = this.uniqueIndex(this.phone);

  public tableName(): string {
    return 'users';
  }
}
```
### Cities Table
---
```typescript
interface CityMeta {
  population: number,
  connection: string,
}

export default class CitiesTable extends AbstractTable<CitiesTable> {
  public id = this.int('id').autoIncrement().primaryKey();

  public foundationDate = this.timestamp('name', { notNull: true });
  public location = this.varchar('page', { size: 256 });

  public userId = this.int('user_id').foreignKey(UsersTable, (table) => table.id, OnDelete.CASCADE);

  public metadata = this.jsonb<CityMeta>('metadata');

  public tableName(): string {
    return 'cities';
  }
}
```
### User Groups Table
---
```typescript
export default class UserGroupsTable extends AbstractTable<UserGroupsTable> {
  public id = this.int('id').autoIncrement().primaryKey();

  public name = this.varchar('name');
  public description = this.varchar('description');

  public tableName(): string {
    return 'user_groups';
  }
}
```
### User to User Groups Table
---
#### Many to many connection between Users and User Groups
```typescript
export default class UsersToUserGroupsTable extends AbstractTable<UsersToUserGroupsTable> {
  public groupId = this.int('city_id').foreignKey(UserGroupsTable, (table) => table.id, OnDelete.CASCADE);
  public userId = this.int('user_id').foreignKey(UsersTable, (table) => table.id, OnDelete.CASCADE);

  public manyToManyIndex = this.index([this.groupId, this.userId]);

  public tableName(): string {
    return 'users_to_user_groups';
  }
}
```

## CRUD
### Select
---
```typescript
const db = await new DbConnector()
  .connectionString('postgresql://postgres@127.0.0.1/drizzle')
  .connect();

const usersTable = new UsersTable(db);

// select all
const allSelect = await usersTable.select().all();

// select first
const firstSelect = await usersTable.select().first();
```
#### **Sorting and Filtering**
---
##### Select all records from `Users` where phone is `"hello"`
```typescript
const eqSelect = await usersTable.select().where(
  eq(usersTable.phone, 'hello')
).all();
```
##### Select all records from `Users` where **both** phone is `"hello"` **and** phone is `"hello"`
```typescript
const andSelect = await usersTable.select().where(
  and([
    eq(usersTable.phone, 'hello'),
    eq(usersTable.phone, 'hello')
  ]),
).all();
```
##### Select all records from `Users` where **either** phone is `"hello"` **or** phone is `"hello"`
```typescript
const orSelect = await usersTable.select().where(
  or([eq(usersTable.phone, 'hello')]),
).all();
```
##### Select all records from `Users` using **LIMIT** and **OFFSET**
```typescript
const limitOffsetSelect = await usersTable.select({ limit: 10, offset: 10 }).all();
```
##### Select all records from `Users` where `phone` contains `"hello"`
```typescript
const likeSelect = await usersTable.select().where(
  like(usersTable.phone, '%hello%')
).all();
```
##### Select all records from `Users` where `phone` equals to some of values from array
```typescript
const inArraySelect = usersTable.select().where(
  inArray(usersTable.phone, ['hello'])
).all();
```
##### Select all records from `Users` where `phone` greater(**>**) than `"hello"`
```typescript
const greaterSelect = usersTable.select().where(
  greater(usersTable.phone, 'hello')
).all();
```
##### Select all records from `Users` where `phone` less(**<**) than `"hello"`
```typescript
const lessSelect = usersTable.select().where(
  less(usersTable.phone, 'hello')
).all();
```
##### Select all records from `Users` where `phone` greater or equals(**>=**) than `"hello"`
```typescript
const greaterEqSelect = usersTable.select().where(
  greaterEq(usersTable.phone, 'hello')
).all();
```
##### Select all records from `Users` where `phone` less or equals(**<=**) 
```typescript
const lessEqSelect = usersTable.select().where(
  lessEq(usersTable.phone, 'hello')
).all();
```
##### Select all records from `Users` where `phone` is **NULL**
```typescript
const isNullSelect = usersTable.select().where(
  isNull(usersTable.phone)
).all();
```
##### Select all records from `Users` where `phone` not equals to `"hello"`
```typescript
const notEqSelect = usersTable.select().where(
  notEq(usersTable.phone, 'hello')
).all();
```
##### Select all records from `Users` ordered by `phone` in ascending order
```typescript
const ordered = await usersTable.select().orderBy((table) => table.phone, Order.ASC).all();
```

### Updating tables
---
##### Update `fullName` to `newName` in `Users` where phone is `"hello"`
```typescript
await usersTable.update()
  .where(eq(usersTable.phone, 'hello'))
  .set({ fullName: 'newName' })
  .execute();
```
##### Update `fullName` to `newName` in `Users` where phone is `"hello"` returning updated `User` model
```typescript
await usersTable.update()
  .where(eq(usersTable.phone, 'hello'))
  .set({ fullName: 'newName' })
  .all();
```
##### Update `fullName` to `newName` in `Users` where phone is `"hello"` returning updated `User` model
```typescript
await usersTable.update()
  .where(eq(usersTable.phone, 'hello'))
  .set({ fullName: 'newName' })
  .first();
```

### Delete
##### Delete `user` where phone is `"hello"`
```typescript
await usersTable.delete()
      .where(eq(usersTable.phone, 'hello'))
      .execute();
```
##### Delete `user` where phone is `"hello"` returning updated `User` model
```typescript
await usersTable.delete()
      .where(eq(usersTable.phone, 'hello'))
      .all();
```
##### Delete `user` where phone is `"hello"` returning updated `User` model
```typescript
await usersTable.delete()
      .where(eq(usersTable.phone, 'hello'))
      .first();
```

### Inserting entities
##### Insert `user` with required fields
```typescript
await usersTable.insert({
  test: 1,
  createdAt: new Date(),
}).execute();
```
##### Insert `user` with required fields and get all rows as array
```typescript
const user = await usersTable.insert({
  test: 1,
  createdAt: new Date(),
}).all();
```
##### Insert `user` with required fields and get inserted entity
```typescript
const user = await usersTable.insert({
  test: 1,
  createdAt: new Date(),
}).first();
```
##### Insert many `users` with required fields and get all inserted entities
```typescript
const users = await usersTable.insertMany([{
      test: 1,
      createdAt: new Date(),
    }, {
      test: 2,
      createdAt: new Date(),
    }]).all();
```
##### Insert many `users` with required fields and get all inserted entities. If such user already exists - update `phone` field
```typescript
await usersTable.insertMany([{
      test: 1,
      createdAt: new Date(),
    }, {
      test: 2,
      createdAt: new Date(),
    }])
      .onConflict(
        (table) => table.phoneIndex,
        { phone: 'confilctUpdate' },
      ).all();
```

## Joins
### Join One-To-Many Tables
##### Join Cities with Users and map to city object with full user
```typescript
const usersTable = new UsersTable(db);
const citiesTable = new CitiesTable(db);

 const userWithCities = await citiesTable.select()
      .where(eq(citiesTable.id, 1))
      .leftJoin(UsersTable,
        (city) => city.userId,
        (users) => users.id)
      .execute();

const citiesWithUserObject = userWithCities.map((city, user) => ({ ...city, user }));
```

### Join Many-To-Many Tables
##### Join User Groups with Users, using many-to-many table and map response to get user object with groups array
```typescript
    const usersWithUserGroups = await usersToUserGroupsTable.select()
      .where(eq(userGroupsTable.id, 1))
      .leftJoin(UsersTable,
        (userToGroup) => userToGroup.userId,
        (users) => users.id)
      .leftJoin(UserGroupsTable,
        (userToGroup) => userToGroup.groupId,
        (users) => users.id)
      .execute();

    const userGroupWithUsers = usersWithUserGroups.group({
      one: (_, dbUser, dbUserGroup) => dbUser!,
      many: (_, dbUser, dbUserGroup) => dbUserGroup!,
    });

    const userWithGroups: ExtractModel<UsersTable> & { groups: ExtractModel<UserGroupsTable>[] } = {
      ...userGroupWithUsers.one,
      groups: userGroupWithUsers.many,
    };
```
##### Join User Groups with Users, using many-to-many table and map response to get user group object with users array
```typescript
    const usersWithUserGroups = await usersToUserGroupsTable.select()
      .where(eq(userGroupsTable.id, 1))
      .leftJoin(UsersTable,
        (userToGroup) => userToGroup.userId,
        (users) => users.id)
      .leftJoin(UserGroupsTable,
        (userToGroup) => userToGroup.groupId,
        (users) => users.id)
      .execute();

    const userGroupWithUsers = usersWithUserGroups.group({
      one: (_, dbUser, dbUserGroup) => dbUserGroup!,
      many: (_, dbUser, dbUserGroup) => dbUser!,
    });

    const userWithGroups: ExtractModel<UserGroupsTable> & { users: ExtractModel<UsersTable>[] } = {
      ...userGroupWithUsers.one,
      users: userGroupWithUsers.many,
    };
```