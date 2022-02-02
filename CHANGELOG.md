# Changelog

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