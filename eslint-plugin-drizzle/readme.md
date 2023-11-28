# eslint-plugin-drizzle

eslint plugin for drizzle users to avoid common pitfalls

## Install

```sh
[ npm | yarn | pnpm | bun ] install eslint eslint-plugin-drizzle
```

## Usage

Use a [preset config](#preset-configs) or configure each rule in `package.json` or `eslint.config.js`.

If you don't use the preset, ensure you use the same `env` and `parserOptions` config as below.

```json
{
  "name": "my-awesome-project",
  "eslintConfig": {
    "env": {
      "es2024": true
    },
    "parserOptions": {
      "ecmaVersion": "latest",
      "sourceType": "module"
    },
    "plugins": ["drizzle"],
    "rules": {
      "drizzle/enforce-delete-with-where": "error",
      "drizzle/enforce-update-with-where": "error"
    }
  }
}
```

## Rules

**enforce-delete-with-where**: Enforce using `delete` with `where` in `DELETE` statement
Optionally, you can defined a `drizzleObjectName` in the plugin options that accepts a string or an array of strings.
This is useful when you have object or classes with a delete method that's not from drizzle. Such delete method will trigger the eslint rule.
To avoid that, you can define the name of the drizzle object that you use in your codebase (like `db`) so that the rule would only trigger if the delete method comes from this object:
```json
"rules": {
  "drizzle/enforce-delete-with-where": ["error", { "drizzleObjectName": ["db", "dataSource", "database"] }],
}
```

**enforce-update-with-where**: Enforce using `update` with `where` in `UPDATE` statement
Similar to the delete rule, you can define the name of the drizzle object that you use in your codebase (like `db`) so that the rule would only trigger if the update method comes from this object:
```json
"rules": {
  "drizzle/enforce-update-with-where": ["error", { "drizzleObjectName": "db" }],
}
```

## Preset configs

### Recommended config

This plugin exports a [`recommended` config](src/configs/recommended.js) that enforces good practices.

```json
{
  "name": "my-awesome-project",
  "eslintConfig": {
    "extends": "plugin:drizzle/recommended"
  }
}
```

### All config

This plugin exports an [`all` config](src/configs/all.js) that makes use of all rules (except for deprecated ones).

```json
{
  "name": "my-awesome-project",
  "eslintConfig": {
    "extends": "plugin:drizzle/all"
  }
}
```

At the moment, `all` is equivalent to `recommended`.
