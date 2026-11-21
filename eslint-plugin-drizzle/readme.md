# eslint-plugin-drizzle

For cases where it's impossible to perform type checks for specific scenarios, or where it's possible but error messages would be challenging to understand, we've decided to create an ESLint package with recommended rules. This package aims to assist developers in handling crucial scenarios during development

> Big thanks to @Angelelz for initiating the development of this package and transferring it to the Drizzle Team's npm

## Install

```sh
[ npm | yarn | pnpm | bun ] install eslint eslint-plugin-drizzle
```

You can install those packages for typescript support in your IDE

```sh
[ npm | yarn | pnpm | bun ] install @typescript-eslint/eslint-plugin @typescript-eslint/parser
```

## Usage

Create a `.eslintrc.yml` file, add `drizzle` to the `plugins`, and specify the rules you want to use. You can find a list of all existing rules below

```yml
root: true
parser: '@typescript-eslint/parser'
parserOptions:
  project: './tsconfig.json'
plugins:
  - drizzle
rules:
  'drizzle/enforce-delete-with-where': "error"
  'drizzle/enforce-update-with-where': "error"
```

### All config

This plugin exports an [`all` config](src/configs/all.js) that makes use of all rules (except for deprecated ones).

```yml
root: true
extends:
  - "plugin:drizzle/all"
parser: '@typescript-eslint/parser'
parserOptions:
  project: './tsconfig.json'
plugins:
  - drizzle
```

At the moment, `all` is equivalent to `recommended`

```yml
root: true
extends:
  - "plugin:drizzle/recommended"
parser: '@typescript-eslint/parser'
parserOptions:
  project: './tsconfig.json'
plugins:
  - drizzle
```

## Rules

**enforce-delete-with-where**: Enforce using `delete` with the`.where()` clause in the `.delete()` statement. Most of the time, you don't need to delete all rows in the table and require some kind of `WHERE` statements.

Optionally, you can define a `drizzleObjectName` in the plugin options that accept a `string` or `string[]`. This is useful when you have objects or classes with a delete method that's not from Drizzle. Such a `delete` method will trigger the ESLint rule. To avoid that, you can define the name of the Drizzle object that you use in your codebase (like db) so that the rule would only trigger if the delete method comes from this object:

Example, config 1:

```json
"rules": {
  "drizzle/enforce-delete-with-where": ["error"]
}
```

```ts
class MyClass {
  public delete() {
    return {}
  }
}

const myClassObj = new MyClass();

// ---> Will be triggered by ESLint Rule
myClassObj.delete()

const db = drizzle(...)
// ---> Will be triggered by ESLint Rule
db.delete()
```

Example, config 2:

```json
"rules": {
  "drizzle/enforce-delete-with-where": ["error", { "drizzleObjectName": ["db"] }],
}
```

```ts
class MyClass {
  public delete() {
    return {}
  }
}

const myClassObj = new MyClass();

// ---> Will NOT be triggered by ESLint Rule
myClassObj.delete()

const db = drizzle(...)
// ---> Will be triggered by ESLint Rule
db.delete()
```

**enforce-update-with-where**: Enforce using `update` with the`.where()` clause in the `.update()` statement. Most of the time, you don't need to update all rows in the table and require some kind of `WHERE` statements.

Optionally, you can define a `drizzleObjectName` in the plugin options that accept a `string` or `string[]`. This is useful when you have objects or classes with a delete method that's not from Drizzle. Such as `update` method will trigger the ESLint rule. To avoid that, you can define the name of the Drizzle object that you use in your codebase (like db) so that the rule would only trigger if the delete method comes from this object:

Example, config 1:

```json
"rules": {
  "drizzle/enforce-update-with-where": ["error"]
}
```

```ts
class MyClass {
  public update() {
    return {}
  }
}

const myClassObj = new MyClass();

// ---> Will be triggered by ESLint Rule
myClassObj.update()

const db = drizzle(...)
// ---> Will be triggered by ESLint Rule
db.update()
```

Example, config 2:

```json
"rules": {
  "drizzle/enforce-update-with-where": ["error", { "drizzleObjectName": ["db"] }],
}
```

```ts
class MyClass {
  public update() {
    return {}
  }
}

const myClassObj = new MyClass();

// ---> Will NOT be triggered by ESLint Rule
myClassObj.update()

const db = drizzle(...)
// ---> Will be triggered by ESLint Rule
db.update()
```

**enforce-alias-in-subquery**: Enforce an explicit `.as('alias')` on a raw `` sql`...` `` field whose name drizzle reads from a subquery, CTE, or set operation.

A plain column carries its own SQL name, but a raw `` sql`...` `` template does not. Whenever drizzle needs that field's name — to build a set operation, or to read the field back out of a subquery/CTE — an unaliased raw field throws **when the query is built** (not at compile time). drizzle calls all of these a "subquery" in the error:

```
Error: You tried to reference "role" field from a subquery, which is a raw SQL field,
but it doesn't have an alias declared. Please add an alias to the field using ".as('alias')" method.
```

This rule turns that runtime crash into a lint error. The **subquery/CTE** case is auto-fixed — there the alias must equal the referenced key, so the fix is unambiguous. The **set-operation** case offers a manual _suggestion_ instead: the correct alias is the one used for that field in the _other_ branch, which the rule cannot infer, so it never rewrites your code automatically.

**Set operations** (`union`, `unionAll`, `except`, `exceptAll`, `intersect`, `intersectAll`) line up their branches by position and take the output column names from the **leading** branch. An unaliased raw field in a _trailing_ branch throws when the query is built; a leading one is silently re-inlined, but breaks the moment the branches are reordered or the set operation is wrapped in a subquery. So every branch's unaliased raw field is flagged — inline or via a variable — with a suggestion to add `.as(...)` (use the same alias as the matching field in the other branch):

```ts
// ---> Will be triggered ("role" has no alias), inline or via a variable
const everyone = await union(
  db.select({ role: sql<string>`'coach'`, id: users.id }).from(users),
  db.select({ role: sql<string>`'athlete'`, id: users.id }).from(athletes),
);

// ---> Will NOT be triggered: every raw `sql` field is aliased
const ok = await union(
  db.select({ role: sql<string>`'coach'`.as('role'), id: users.id }).from(users),
  db.select({ role: sql<string>`'athlete'`.as('role'), id: users.id }).from(athletes),
);
```

**Subqueries and CTEs** (a subquery is `` <select>.as('name') ``, a CTE is `db.$with('name').as(<select>)`) only read a field when it is *used*, so the rule flags a raw field when it is read — through an explicit `subquery.field` reference, or by selecting all columns (`db.select().from(subquery)`, which reads every field). Fields that are never read are left alone:

```ts
const withCount = db
  .select({ total: sql<number>`count(*)`, day: activities.day })
  .from(activities)
  .groupBy(activities.day)
  .as('with_count');

// ---> Will be triggered ("total" is read as with_count.total)
const a = db.select({ total: withCount.total }).from(withCount);

// ---> Will be triggered (select-all reads every field of the subquery)
const b = db.select().from(withCount);

// ---> Will NOT be triggered: only the plain column `day` is read
const c = db.select({ day: withCount.day }).from(withCount);
```

Notes: fields pulled into a `.select()` through a spread from another module (`...sharedSelect`) are not traced across files, so alias the raw `sql` fields inside such shared select objects directly. The subquery/CTE check tracks values assigned to a variable; inline subqueries and aliases reassigned to another variable are best-effort.
