// @ts-ignore
import { RuleTester } from "@typescript-eslint/rule-tester";

import myRule from "../src/enforce-update-with-where";

const parserResolver = require.resolve("@typescript-eslint/parser");

const ruleTester = new RuleTester({
  parser: parserResolver,
});

ruleTester.run("my-rule", myRule, {
  valid: [
    "const a = db.update({}).set().where({});",
    "const a = db.update();",
    "update()",
    `da
      .update()
      .set()
      .where()`,
    `dataSource
      .update()
      .set()
      .where()`,
  ],
  invalid: [
    {
      code: "db.update({}).set()",
      errors: [{ messageId: "enforceUpdateWithWhere" }],
    },
    {
      code: "const a = await db.update({}).set()",
      errors: [{ messageId: "enforceUpdateWithWhere" }],
    },
    {
      code: "const a = db.update({}).set",
      errors: [{ messageId: "enforceUpdateWithWhere" }],
    },
    {
      code: `const a = database
        .update({})
        .set()`,
      errors: [{ messageId: "enforceUpdateWithWhere" }],
    },
  ],
});
