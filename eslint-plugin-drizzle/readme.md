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
