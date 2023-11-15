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

**enforce-update-with-where**: Enforce using `update` with `where` in `UPDATE` statement

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
