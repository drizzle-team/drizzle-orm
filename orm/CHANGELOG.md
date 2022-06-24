# Changelog
### 0.11.3 (June 24, 2022)
### Documentation:
- New version of `drizzle-orm` documentation written by [Aleksandr Blokh](https://github.com/AlexBlokh)

### 0.11.2 (June 22, 2022)
### Fixes
- Move back classes for v1 joins, so mapping will work as previously
---
### 0.11.1 (June 21, 2022)
### Documentation:
- Change README documentation for all changes in current release
### Fixes and Functionality:
- Deprecate `onEq()` function. Right now for any filter expression construction(either for `where` or for `joins`) you could use `eq()` ([#PR](https://github.com/lambda-direct/drizzle-orm/pull/26) by [Danil Kochetov](https://github.com/dankochetov))
- Fix previous joins types and query builders
- Move `where()` call after new joins implementation. To be consistent with SQL syntax, if you are using joins you need to specify `where()` statement after all joins
- `where()` will have callback in param, that will have all tables, that were used in query, so you could choose which table should be filtered (Same as callback in new joins)

>_**Note**: Current changes with `where` statements were added only for new joins implementation_
#### Previous `where` statement in new joins
```typescript
const usersWithUserGroups1 = await usersToUserGroupsTable.select()
  .where(eq(userGroupsTable.id, 2))
  .leftJoin(usersTable, (usersToUserGroups, users) => eq(usersToUserGroups.userId, users.id))
  .leftJoin(userGroupsTable, (usersToUserGroups, _users, userGroups) => eq(usersToUserGroups.groupId, userGroups.id))
  .execute();
```
#### Current `where` statement in new joins
```typescript
const usersWithUserGroups = await usersToUserGroupsTable.select()
  .leftJoin(usersTable, (usersToUserGroups, users) => eq(usersToUserGroups.userId, users.id))
  .leftJoin(userGroupsTable, (usersToUserGroups, _users, userGroups) => eq(usersToUserGroups.groupId, userGroups.id))
  .where((usersToUserGroups, _users, userGroups) => eq(userGroups.id, 2))
  .execute();
```

---
### 0.11.0 (June 17, 2022)
### Breaking changes:
- Joins were fully updated to new API. Old API were marked as deprecated and name was changed to V1, but all functionality inside left the same
>Starting from now you can add any amount of joins in your query
---

#### Deprecated API functions
##### Previous join example
```typescript
await citiesTable.select()
      .leftJoin(UsersTable,
        (city) => city.userId,
        (users) => users.id,
        {
          id: usersTable.id,
        })
      .execute();
```
##### Current join examples as deprecated
```typescript
await citiesTable.select()
      .leftJoinV1(UsersTable,
        (city) => city.userId,
        (users) => users.id,
        {
          id: usersTable.id,
        })
      .execute();
```
>_**Note**: Only first join calls were deprecated and renamed to v1 version. All other joins are independent blocks of call hierarchy_
---
Simple example of new joins
```typescript
// Example 1
const joinsWithFullObjectResponse = await citiesTable.select()
  .leftJoin(usersTable, (cities, users) => onEq(cities.userId, users.id))
  .execute();

// Example 2
const joinsWithPartialObjectResponse = await citiesTable.select({ customUserId: citiesTable.userId })
  .leftJoin(usersTable,
    (cities, partialUsers) => onEq(cities.customUserId, partialUsers.customId),
    { customId: usersTable.id })
  .leftJoin(usersTable,
    (_cities, partialUsers, anotherUsersJoin) => onEq(partialUsers.customId, anotherUsersJoin.anotherId),
    { anotherId: usersTable.id })
  .execute();

const joinResponse = newJoinRes1.map((city, user) => ({ city, user }));
```
Each join has several params
1. Which table you want to join - (**Required**)
2. Callback, that has all joined tables in parameters in same order it was executed. In example 1 we have `citiesTable` as first param in callback and `usersTable` in second param in callback.
In example 2 we have `citiesTable` as first param in callback, `usersTable` in second param in callback and `usersTable` in third param in callback - (**Required**).

>Current callback need to return any expression, that should stay after `ON` -> `"JOIN table ON <expression>"`. This expression could be any filter expression from a system
```typescript
await citiesTable.select()
  .where(eq(citiesTable.location, 'q'))
  .leftJoin(usersTable, (cities, _users) => eq(cities.id, 13))
  .execute();
// Join statement generated from query
// LEFT JOIN users AS users_1
// ON cities."id"=$1
// WHERE cities."page"=$2
//
// Values: [13, 'q']

await citiesTable.select()
  .leftJoin(usersTable, (cities, _users) => and([
    eq(cities.id, 13), notEq(cities.id, 14),
  ]))
  .execute();
// Join statement generated from query
// LEFT JOIN users AS users_1
// ON (cities."id"=$1 and cities."id"!=$2)
//
// Values: [13, 14]

await citiesTable.select()
  .where(eq(citiesTable.location, 'location'))
  .leftJoin(usersTable, (_cities, _users) => raw('<custom expression after ON statement>'))
  .execute();
// Join statement generated from query
// LEFT JOIN users AS users_1
// ON <custom expression after ON statement>
// WHERE cities."page"=$1
// 
// Values: ['location']
```

3. Partial select interface -  (**Optional**)
---

### 0.10.6 (Fabruary 06, 2022)
### Fixes and Functionality:
- Move from simple query execution to parameterized queries
### Breaking changes:
- For `raw` query execution you need to provide values together with query
#### Previous you could run simple query
```typescript
const res: QueryResult<any> = await db.session().execute('SELECT * FROM users WHERE user.id = 1');
```
#### Currently you need to provide prepared statement with values as array
```typescript
const res: QueryResult<any> = await db.session().execute('SELECT * FROM users WHERE user.id = $1', [1]);
```
It's still possible to execute query as before, without providing any values array. But we highly recommend to separate those

---
### 0.10.4 (Fabruary 02, 2022)
### Fixes and Functionality:
- Fix `int` and `smallint` mappings from pg driver
---
### 0.10.0 (January 27, 2022)
### Breaking changes:
 - Move limit offset to function calls
 #### Previous limit/offset usage:
 ```typescript
 await usersTable.select({limit: 20, offset: 20}).all();
 ```
 #### Current limit/offset usage:
 ```typescript
 await usersTable.select().limit(20).offset(20).all();
 ```
 - Change join calls starting from second one

 Starting from second join you need to provide table to join from. As long as PostgreSQL has a possibility to join on tables, that already were in previous joins, we need to have a possibility to clarify from which exact table we need to join
  #### Previous join funcition call with parameters:
  ```typescript
  await usersToUserGroupsTable.select()
      .where(eq(userGroupsTable.id, 1))
      .leftJoin(UsersTable,
        (userToGroup) => userToGroup.userId,
        (users) => users.id)
      .leftJoin(UserGroupsTable,
        (userToGroup) => userToGroup.groupId,
        (userGroup) => userGroup.id)
      .execute()
  ```
  #### Current join funcition call with parameters:
  ```typescript
  await usersToUserGroupsTable.select()
      .where(eq(userGroupsTable.id, 1))
      .leftJoin(UsersTable,
        (userToGroup) => userToGroup.userId,
        (users) => users.id)
      .leftJoin(UsersToUserGroupsTable, UserGroupsTable,
        (userToGroup) => userToGroup.groupId,
        (userGroup) => userGroup.id)
      .execute()
  ```
 - Create partial select on simple select + on each join

 If you want to select only specific fields from select request you could provide your own interface with columns to map to:
 #### Example
 ```typescript
    const partialSelect = await usersTable.select({
      id: usersTable.id,
      phone: usersTable.phone,
    }).all();

    // Usage
    const { mappedId, mappedPhone } = partialSelect;
 ```

Same could be done with specific columns selecting on joined tables
#### Example
```typescript
    const usersWithUserGroups = await usersToUserGroupsTable.select()
      .where(eq(userGroupsTable.id, 1))
      .leftJoin(UsersTable,
        (userToGroup) => userToGroup.userId,
        (users) => users.id,
        // Partial fields to be selected from UsersTable
        {
          id: usersTable.id,
        })
      .leftJoin(UsersToUserGroupsTable, UserGroupsTable,
        (userToGroup) => userToGroup.groupId,
        (userGroup) => userGroup.id,
        // Partial fields to be selected from UserGroupsTable
        {
          id: userGroupsTable.id,
        })
      .execute();
```

 - Create possibility to have self FK and self joins
 
 You could create FK on same table you are creating it from
 #### Example
 ```typescript
 public cityId = this.int('city_id').foreignKey(CitiesTable, (table) => table.id, { onUpdate: 'CASCADE' });
 ```
 - Delete first() on execution and add findOne(), that will throw an error

 Previously we had `.first()` function, that was just getting first element from rows returned from `pg` driver
 Right now, invoking `.findOne()` function should check if response contains exactly 1 element in repsponse. If not, it will throw an error
 ### Example
 ```typescript
const firstSelect = await usersTable.select().findOne();
 ```
 - Fix wrong types. Right now you won't get undefined from select query
---

### 0.9.19 (January 24, 2022)
### Fixes and Functionality:
- Fix all queries by `Date`

---

### 0.9.18 (December 28, 2021)
### Fixes and Functionality:
- Fix `any` type returning from `.notNull()` and `.primaryKey()` functions

---

### 0.9.17 (December 27, 2021)
### Fixes and Functionality:
- Add serializer `fromDb()` method to introspect selected database to drizzle-kit json shanpsot format

---
### 0.9.16 (December 27, 2021)
### Breaking changes:
- Delete `autoincrement` type on columns. Right now you should use `serial` type

#### Previous serial column defining:
```typescript
public id = this.int('id').autoincrement();
```
#### Current serial column defining:
```typescript
public id = this.serial('id');
```

- Move `notNull` from column type metadata to builder chain
#### Previous notNull defining:
```typescript
public phone = this.varchar('phone', { notNull: true });
```
#### Current notNull defining:
```typescript
public phone = this.varchar('phone').notNull();
```

- Divide `BigInt` into 2 types -> `BigInt53` and `BigInt64`
- Divide `BigSerial` into 2 types -> `BigSerial53` and `BigSerial64`

    Due to have max value for big integers in postgres as 2^64 and javascript max value for integers is 2^53

    If you sure, that value in this column won't be more than 2^53 you could use:
    ```typescript
    public bigIntField = this.bigint('test1', 'max_bytes_53');
    ```
    that will be of type `number` in typescript

    If value in this column could be more than 2^53 you could use:
    ```typescript
    public bigIntField = this.bigint('test1', 'max_bytes_64');
    ```
    that will be of type `bigint` in typescript
---

### Fixes and Functionality:
- Add `SET NULL` and `SET DEFAULT` for `ON DELETE` and `ON UPDATE` constraints

#### Example of usage
```typescript
public userId = this.int('user_id').foreignKey(UsersTable, (table) => table.id, { onUpdate: 'SET NULL' });

public userId = this.int('user_id').foreignKey(UsersTable, (table) => table.id, { onDelete: 'SET DEFAULT' });
```
- Add default value for timestamp
```typescript
public createdAt = this.timestamp('created_at').defaultValue(Defaults.CURRENT_TIMESTAMP);
```
- Add `timestamp with timezone` type
```typescript
public createdAt = this.timestamptz('created_at');
```
- Add migrator function to use `drizzle-kit` generated migrations
##### Provide drizzle-kit config path
```typescript
await drizzle.migrator(db).migrate('src/drizzle.config.yaml');
```
##### Provide object with path to folder with migrations
```typescript
await drizzle.migrator(db).migrate({ migrationFolder: 'drizzle' });
```
---

### Documentation:
- Change README documentation for all changes in current release