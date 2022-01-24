# Changelog

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