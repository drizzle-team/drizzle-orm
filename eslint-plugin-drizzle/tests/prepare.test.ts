// @ts-ignore
import { RuleTester } from '@typescript-eslint/rule-tester';

import rule from '../src/enforce-prepare-has-unique-name';

const ruleTester = new RuleTester();

ruleTester.run('enforce-prepare-has-unique-name', rule, {
  valid: [
    {
      code: `
        drizzle.select().from(table).prepare('query1');
        drizzle.select().from(table).prepare('query2');
      `,
    },
    {
      code: `
        db.select().from(table).prepare('query1');
        db.select().from(table).prepare('query2');
      `,
      options: [{ drizzleObjectName: ['db'] }],
    },
    {
      code: `
        drizzle.select().from(table).prepare('query1');
        db.select().from(table).prepare('query2');
      `,
      options: [{ drizzleObjectName: ['drizzle', 'db'] }],
    },
  ],
  invalid: [
    {
      code: `
        drizzle.select().from(table).prepare('query1');
        drizzle.select().from(table).prepare('query1');
      `,
      // test without options
      errors: [
        {
          messageId: 'enforcePrepareHasUniqueName',
          data: {
            preparedName: 'query1',
            location: 'file.ts:2',
          },
        },
      ],
    },
    {
      code: `
        drizzle.select().from(table).prepare('query1');
        drizzle.select().from(table).prepare('query1');
      `,
      options: [{ drizzleObjectName: ['drizzle'] }],
      errors: [
        {
          messageId: 'enforcePrepareHasUniqueName',
          data: {
            preparedName: 'query1',
            location: 'file.ts:2',
          },
        },
      ],
    },
    {
      code: `
        db.select().from(table).prepare('query1');
        db.select().from(table).prepare('query2');
        db.select().from(table).prepare('query1');
      `,
      errors: [
        {
          messageId: 'enforcePrepareHasUniqueName',
          data: {
            preparedName: 'query1',
            location: 'file.ts:2',
          },
        },
      ],
    },
    {
      code: `
        drizzle.select().from(table).prepare('query1');
        db.select().from(table).prepare('query1');
      `,
      errors: [
        {
          messageId: 'enforcePrepareHasUniqueName',
          data: {
            preparedName: 'query1',
            location: 'file.ts:2',
          },
        },
      ],
    },
  ],
});
