import { expect, test } from 'vitest';
import { printValidationErrors, validatePgSchema } from 'src/validate-schema/validate';
import { foreignKey, index, integer, pgEnum, pgSchema, pgSequence, pgTable, primaryKey, serial, text, unique, vector } from 'drizzle-orm/pg-core';
import { prepareFromExports } from 'src/serializer/pgImports';
import { SchemaValidationErrors as Err } from 'src/validate-schema/errors';
import { sql } from 'drizzle-orm';

test('schemas name collisions #1', () => {
  const schema = {
    test1Schema: pgSchema('test1'),
    test2Schema: pgSchema('test1'),
  };

  const { schemas, enums, tables, sequences, views, materializedViews } = prepareFromExports(schema);

  const { messages, codes } = validatePgSchema(
    undefined,
    schemas,
    tables,
    views,
    materializedViews,
    enums,
    sequences
  );

  expect(messages).length(1);
  expect(codes).contains(Err.SchemaNameCollisions);
});

test('schemas name collisions #2', () => {
  const schema = {
    test1Schema: pgSchema('test1'),
    test2Schema: pgSchema('test1'),
    test3Schema: pgSchema('test1'),
    test4Schema: pgSchema('test2'),
    test5Schema: pgSchema('test2'),
    test6Schema: pgSchema('test3'),
  };

  const { schemas, enums, tables, sequences, views, materializedViews } = prepareFromExports(schema);

  const { messages, codes } = validatePgSchema(
    undefined,
    schemas,
    tables,
    views,
    materializedViews,
    enums,
    sequences
  );

  expect(messages).length(2);
  expect(codes).contains(Err.SchemaNameCollisions);
});

test('schema entity name collisions #1', () => {
  const schema = {
    table1: pgTable('test', {
      id: serial().primaryKey()
    }),
    table2: pgTable('test', {
      id: serial().primaryKey()
    }),
  };

  const { schemas, enums, tables, sequences, views, materializedViews } = prepareFromExports(schema);

  const { messages, codes } = validatePgSchema(
    undefined,
    schemas,
    tables,
    views,
    materializedViews,
    enums,
    sequences
  );

  expect(messages).length(1);
  expect(codes).contains(Err.SchemaEntityNameCollisions);
});

test('schema entity name collisions #2', () => {
  const schema = {
    table: pgTable('test', {
      id: serial().primaryKey()
    }),
    sequence: pgSequence('test')
  };

  const { schemas, enums, tables, sequences, views, materializedViews } = prepareFromExports(schema);

  const { messages, codes } = validatePgSchema(
    undefined,
    schemas,
    tables,
    views,
    materializedViews,
    enums,
    sequences
  );

  expect(messages).length(1);
  expect(codes).contains(Err.SchemaEntityNameCollisions);
});

test('schema entity name collisions #3', () => {
  const mySchema = pgSchema('my_schema');
  const schema = {
    table: pgTable('test', {
      id: serial().primaryKey()
    }),
    mySchemaTable: mySchema.table('test', {
      id: serial().primaryKey()
    })
  };

  const { schemas, enums, tables, sequences, views, materializedViews } = prepareFromExports(schema);

  const { messages, codes } = validatePgSchema(
    undefined,
    schemas,
    tables,
    views,
    materializedViews,
    enums,
    sequences
  );

  expect(messages).length(0);
  expect(codes).not.contains(Err.SchemaEntityNameCollisions);
});

test('schema constraint name collisions #1', () => {
  const schema = {
    table1: pgTable('test1', {
      id: serial().primaryKey(),
      name: text('name').notNull()
    }, (table) => ({
      idx: index('name_idx').on(table.name),
    })),
    table2: pgTable('test2', {
      id: serial().primaryKey(),
      name: text('name').notNull()
    }, (table) => ({
      idx: index('name_idx').on(table.name),
    })),
  };

  const { schemas, enums, tables, sequences, views, materializedViews } = prepareFromExports(schema);

  const { messages, codes } = validatePgSchema(
    undefined,
    schemas,
    tables,
    views,
    materializedViews,
    enums,
    sequences
  );

  expect(messages).length(1);
  expect(codes).contains(Err.SchemaConstraintNameCollisions);
});

test('schema constraint name collisions #2', () => {
  const schema = {
    table1: pgTable('test1', {
      id: serial().primaryKey(),
      name: text('name').notNull()
    }, (table) => ({
      idx: index('name_idx').on(table.name),
    })),
    table2: pgTable('test2', {
      id: serial().primaryKey(),
      name: text('name').notNull()
    }, (table) => ({
      unique: unique('name_idx').on(table.name),
    })),
  };

  const { schemas, enums, tables, sequences, views, materializedViews } = prepareFromExports(schema);

  const { messages, codes } = validatePgSchema(
    undefined,
    schemas,
    tables,
    views,
    materializedViews,
    enums,
    sequences
  );

  expect(messages).length(1);
  expect(codes).contains(Err.SchemaConstraintNameCollisions);
});

test('enum value collisions #1', () => {
  const schema = {
    enum_: pgEnum('test', ['a', 'a', 'b', 'c', 'c'])
  };

  const { schemas, enums, tables, sequences, views, materializedViews } = prepareFromExports(schema);

  const { messages, codes } = validatePgSchema(
    undefined,
    schemas,
    tables,
    views,
    materializedViews,
    enums,
    sequences
  );

  expect(messages).length(2);
  expect(codes).contains(Err.EnumValueCollisions);
});

test('enum value collisions #2', () => {
  const schema = {
    enum_: pgEnum('test', ['a', 'A', 'b', 'c', 'C'])
  };

  const { schemas, enums, tables, sequences, views, materializedViews } = prepareFromExports(schema);

  const { messages, codes } = validatePgSchema(
    undefined,
    schemas,
    tables,
    views,
    materializedViews,
    enums,
    sequences
  );

  expect(messages).length(0);
  expect(codes).not.contains(Err.EnumValueCollisions);
});

test('sequence incorrect values #1', () => {
  const schema = {
    sequence: pgSequence('test')
  };

  const { schemas, enums, tables, sequences, views, materializedViews } = prepareFromExports(schema);

  const { messages, codes } = validatePgSchema(
    undefined,
    schemas,
    tables,
    views,
    materializedViews,
    enums,
    sequences
  );

  expect(messages).length(0);
  expect(codes).not.contains(Err.SequenceIncrementByZero);
  expect(codes).not.contains(Err.SequenceInvalidMinMax);
});

test('sequence incorrect values #2', () => {
  const schema = {
    sequence: pgSequence('test', {
      increment: 0
    })
  };

  const { schemas, enums, tables, sequences, views, materializedViews } = prepareFromExports(schema);

  const { messages, codes } = validatePgSchema(
    undefined,
    schemas,
    tables,
    views,
    materializedViews,
    enums,
    sequences
  );

  expect(messages).length(1);
  expect(codes).contains(Err.SequenceIncrementByZero);
  expect(codes).not.contains(Err.SequenceInvalidMinMax);
});

test('sequence incorrect values #3', () => {
  const schema = {
    sequence: pgSequence('test', {
      increment: 2,
      minValue: 1000,
      maxValue: 100
    })
  };

  const { schemas, enums, tables, sequences, views, materializedViews } = prepareFromExports(schema);

  const { messages, codes } = validatePgSchema(
    undefined,
    schemas,
    tables,
    views,
    materializedViews,
    enums,
    sequences
  );

  expect(messages).length(1);
  expect(codes).not.contains(Err.SequenceIncrementByZero);
  expect(codes).contains(Err.SequenceInvalidMinMax);
});

test('sequence incorrect values #4', () => {
  const schema = {
    sequence: pgSequence('test', {
      increment: 0,
      minValue: 2000,
      maxValue: 300
    })
  };

  const { schemas, enums, tables, sequences, views, materializedViews } = prepareFromExports(schema);

  const { messages, codes } = validatePgSchema(
    undefined,
    schemas,
    tables,
    views,
    materializedViews,
    enums,
    sequences
  );

  expect(messages).length(2);
  expect(codes).contains(Err.SequenceIncrementByZero);
  expect(codes).contains(Err.SequenceInvalidMinMax);
});

test('table column name collisions #1', () => {
  const schema = {
    table: pgTable('test', {
      id: serial().primaryKey(),
      firstName: text('first_name').notNull(),
      lastName: text('last_name').notNull()
    })
  };

  const { schemas, enums, tables, sequences, views, materializedViews } = prepareFromExports(schema);

  const { messages, codes } = validatePgSchema(
    undefined,
    schemas,
    tables,
    views,
    materializedViews,
    enums,
    sequences
  );

  expect(messages).length(0);
  expect(codes).not.contains(Err.TableColumnNameCollisions);
});

test('table column name collisions #2', () => {
  const schema = {
    table: pgTable('test', {
      id: serial().primaryKey(),
      firstName: text('first_name').notNull(),
      lastName: text('first_name').notNull()
    })
  };

  const { schemas, enums, tables, sequences, views, materializedViews } = prepareFromExports(schema);

  const { messages, codes } = validatePgSchema(
    undefined,
    schemas,
    tables,
    views,
    materializedViews,
    enums,
    sequences
  );

  expect(messages).length(1);
  expect(codes).contains(Err.TableColumnNameCollisions);
});

test('table column name collisions #3', () => {
  const schema = {
    table: pgTable('test', {
      id: serial().primaryKey(),
      firstName: text('last_name').notNull(),
      lastName: text().notNull()
    })
  };

  const { schemas, enums, tables, sequences, views, materializedViews } = prepareFromExports(schema);

  const { messages, codes } = validatePgSchema(
    undefined,
    schemas,
    tables,
    views,
    materializedViews,
    enums,
    sequences
  );

  expect(messages).length(0);
  expect(codes).not.contains(Err.TableColumnNameCollisions);
});

test('table column name collisions #4', () => {
  const schema = {
    table: pgTable('test', {
      id: serial().primaryKey(),
      firstName: text('last_name').notNull(),
      lastName: text().notNull()
    })
  };

  const { schemas, enums, tables, sequences, views, materializedViews } = prepareFromExports(schema);

  const { messages, codes } = validatePgSchema(
    'snake_case',
    schemas,
    tables,
    views,
    materializedViews,
    enums,
    sequences
  );

  expect(messages).length(1);
  expect(codes).contains(Err.TableColumnNameCollisions);
});

test('table column name collisions #5', () => {
  const schema = {
    table: pgTable('test', {
      id: serial().primaryKey(),
      first_name: text('lastName').notNull(),
      last_name: text().notNull()
    })
  };

  const { schemas, enums, tables, sequences, views, materializedViews } = prepareFromExports(schema);

  const { messages, codes } = validatePgSchema(
    'camelCase',
    schemas,
    tables,
    views,
    materializedViews,
    enums,
    sequences
  );

  expect(messages).length(1);
  expect(codes).contains(Err.TableColumnNameCollisions);
});

test('index requires name #1', () => {
  const schema = {
    table: pgTable('test', {
      id: serial().primaryKey(),
      firstName: text().notNull(),
      lastName: text().notNull()
    }, (table) => ({
      idx: index().on(table.firstName, table.lastName)
    }))
  };

  const { schemas, enums, tables, sequences, views, materializedViews } = prepareFromExports(schema);

  const { messages, codes } = validatePgSchema(
    undefined,
    schemas,
    tables,
    views,
    materializedViews,
    enums,
    sequences
  );

  expect(messages).length(0);
  expect(codes).not.contains(Err.IndexRequiresName);
});

test('index requires name #2', () => {
  const schema = {
    table: pgTable('test', {
      id: serial().primaryKey(),
      firstName: text().notNull(),
      lastName: text().notNull()
    }, (table) => ({
      idx: index().on(table.firstName, sql`lower(${table.lastName})`)
    }))
  };

  const { schemas, enums, tables, sequences, views, materializedViews } = prepareFromExports(schema);

  const { messages, codes } = validatePgSchema(
    undefined,
    schemas,
    tables,
    views,
    materializedViews,
    enums,
    sequences
  );

  expect(messages).length(1);
  expect(codes).contains(Err.IndexRequiresName);
});

test('index vector column requires op #1', () => {
  const schema = {
    table: pgTable('test', {
      id: serial().primaryKey(),
      vec: vector({
        dimensions: 2
      }).notNull()
    }, (table) => ({
      idx: index().on(table.vec.op('vector_cosine_ops'))
    }))
  };

  const { schemas, enums, tables, sequences, views, materializedViews } = prepareFromExports(schema);

  const { messages, codes } = validatePgSchema(
    undefined,
    schemas,
    tables,
    views,
    materializedViews,
    enums,
    sequences
  );

  expect(messages).length(0);
  expect(codes).not.contains(Err.IndexVectorColumnRequiresOp);
});

test('index vector column requires op #2', () => {
  const schema = {
    table: pgTable('test', {
      id: serial().primaryKey(),
      vec: vector({
        dimensions: 2
      }).notNull()
    }, (table) => ({
      idx: index().on(table.vec)
    }))
  };

  const { schemas, enums, tables, sequences, views, materializedViews } = prepareFromExports(schema);

  const { messages, codes } = validatePgSchema(
    undefined,
    schemas,
    tables,
    views,
    materializedViews,
    enums,
    sequences
  );

  expect(messages).length(1);
  expect(codes).contains(Err.IndexVectorColumnRequiresOp);
});

test('foreign key mismatching column count #2', () => {
  const table1 = pgTable('test1', {
    id: serial().primaryKey(),
    c1: integer().notNull(),
    c2: integer().notNull()
  }, (table) => ({
    fk: foreignKey({
      columns: [table.c1, table.c2],
      foreignColumns: [table2.c1, table2.c2],
    })
  }));
  const table2 = pgTable('test2', {
    c1: integer().notNull(),
    c2: integer().notNull()
  }, (table) => ({
    pk: primaryKey({
      columns: [table.c1, table.c2]
    })
  }));
  const schema = {
    table1,
    table2
  };

  const { schemas, enums, tables, sequences, views, materializedViews } = prepareFromExports(schema);

  const { messages, codes } = validatePgSchema(
    undefined,
    schemas,
    tables,
    views,
    materializedViews,
    enums,
    sequences
  );

  expect(messages).length(0);
  expect(codes).not.contains(Err.ForeignKeyMismatchingColumnCount);
});

test('foreign key mismatching data types #1', () => {
  const table1 = pgTable('test1', {
    id: serial().primaryKey(),
    c1: integer().notNull(),
    c2: integer().notNull()
  }, (table) => ({
    fk: foreignKey({
      columns: [table.c1, table.c2],
      foreignColumns: [table2.c1, table2.c2],
    })
  }));
  const table2 = pgTable('test2', {
    c1: integer().notNull(),
    c2: text().notNull()
  }, (table) => ({
    pk: primaryKey({
      columns: [table.c1, table.c2]
    })
  }));
  const schema = {
    table1,
    table2
  };

  const { schemas, enums, tables, sequences, views, materializedViews } = prepareFromExports(schema);

  const { messages, codes } = validatePgSchema(
    undefined,
    schemas,
    tables,
    views,
    materializedViews,
    enums,
    sequences
  );

  expect(messages).length(1);
  expect(codes).contains(Err.ForeignKeyMismatchingDataTypes);
});

test('foreign key mismatching data types #2', () => {
  const table1 = pgTable('test1', {
    id: serial().primaryKey(),
    c1: integer().notNull(),
    c2: text().notNull()
  }, (table) => ({
    fk: foreignKey({
      columns: [table.c1, table.c2],
      foreignColumns: [table2.c1, table2.c2],
    })
  }));
  const table2 = pgTable('test2', {
    c1: integer().notNull(),
    c2: text().notNull()
  }, (table) => ({
    pk: primaryKey({
      columns: [table.c1, table.c2]
    })
  }));
  const schema = {
    table1,
    table2
  };

  const { schemas, enums, tables, sequences, views, materializedViews } = prepareFromExports(schema);

  const { messages, codes } = validatePgSchema(
    undefined,
    schemas,
    tables,
    views,
    materializedViews,
    enums,
    sequences
  );

  expect(messages).length(0);
  expect(codes).not.contains(Err.ForeignKeyMismatchingDataTypes);
});

test('foreign key columns mixing tables #1', () => {
  const table1 = pgTable('test1', {
    id: serial().primaryKey(),
    c1: integer().notNull(),
    c2: text().notNull()
  }, (table) => ({
    fk: foreignKey({
      columns: [table.c1, table.c2],
      foreignColumns: [table2.c1, table2.c2],
    })
  }));
  const table2 = pgTable('test2', {
    c1: integer().notNull(),
    c2: text().notNull()
  }, (table) => ({
    pk: primaryKey({
      columns: [table.c1, table.c2]
    })
  }));
  const schema = {
    table1,
    table2
  };

  const { schemas, enums, tables, sequences, views, materializedViews } = prepareFromExports(schema);

  const { messages, codes } = validatePgSchema(
    undefined,
    schemas,
    tables,
    views,
    materializedViews,
    enums,
    sequences
  );

  expect(messages).length(0);
  expect(codes).not.contains(Err.ForeignKeyColumnsMixingTables);
  expect(codes).not.contains(Err.ForeignKeyForeignColumnsMixingTables);
});

test('foreign key columns mixing tables #2', () => {
  const table1 = pgTable('test1', {
    id: serial().primaryKey(),
    c1: integer().notNull(),
    c2: text().notNull()
  }, (table) => ({
    fk: foreignKey({
      columns: [table2.c1, table.c2],
      foreignColumns: [table2.c1, table2.c2],
    })
  }));
  const table2 = pgTable('test2', {
    c1: integer().notNull(),
    c2: text().notNull()
  }, (table) => ({
    pk: primaryKey({
      columns: [table.c1, table.c2]
    })
  }));
  const schema = {
    table1,
    table2
  };

  const { schemas, enums, tables, sequences, views, materializedViews } = prepareFromExports(schema);

  const { messages, codes } = validatePgSchema(
    undefined,
    schemas,
    tables,
    views,
    materializedViews,
    enums,
    sequences
  );

  expect(messages).length(1);
  expect(codes).contains(Err.ForeignKeyColumnsMixingTables);
  expect(codes).not.contains(Err.ForeignKeyForeignColumnsMixingTables);
});

test('foreign key columns mixing tables #3', () => {
  const table1 = pgTable('test1', {
    id: serial().primaryKey(),
    c1: integer().notNull(),
    c2: text().notNull()
  }, (table) => ({
    fk: foreignKey({
      columns: [table.c1, table.c2],
      foreignColumns: [table2.c1, table.c2],
    })
  }));
  const table2 = pgTable('test2', {
    c1: integer().notNull(),
    c2: text().notNull()
  }, (table) => ({
    pk: primaryKey({
      columns: [table.c1, table.c2]
    })
  }));
  const schema = {
    table1,
    table2
  };

  const { schemas, enums, tables, sequences, views, materializedViews } = prepareFromExports(schema);

  const { messages, codes } = validatePgSchema(
    undefined,
    schemas,
    tables,
    views,
    materializedViews,
    enums,
    sequences
  );

  expect(messages).length(1);
  expect(codes).not.contains(Err.ForeignKeyColumnsMixingTables);
  expect(codes).contains(Err.ForeignKeyForeignColumnsMixingTables);
});

test('foreign key columns mixing tables #4', () => {
  const table1 = pgTable('test1', {
    id: serial().primaryKey(),
    c1: integer().notNull(),
    c2: text().notNull()
  }, (table) => ({
    fk: foreignKey({
      columns: [table.c1, table2.c2],
      foreignColumns: [table2.c1, table.c2],
    })
  }));
  const table2 = pgTable('test2', {
    c1: integer().notNull(),
    c2: text().notNull()
  }, (table) => ({
    pk: primaryKey({
      columns: [table.c1, table.c2]
    })
  }));
  const schema = {
    table1,
    table2
  };

  const { schemas, enums, tables, sequences, views, materializedViews } = prepareFromExports(schema);

  const { messages, codes } = validatePgSchema(
    undefined,
    schemas,
    tables,
    views,
    materializedViews,
    enums,
    sequences
  );

  expect(messages).length(2);
  expect(codes).contains(Err.ForeignKeyColumnsMixingTables);
  expect(codes).contains(Err.ForeignKeyForeignColumnsMixingTables);
});

test('primary key columns mixing tables #1', () => {
  const table1 = pgTable('test1', {
    c1: integer().notNull(),
    c2: text().notNull()
  }, (table) => ({
    fk: primaryKey({
      columns: [table2.c1, table.c2]
    })
  }));
  const table2 = pgTable('test2', {
    c1: integer().notNull(),
  });
  const schema = {
    table1,
    table2
  };

  const { schemas, enums, tables, sequences, views, materializedViews } = prepareFromExports(schema);

  const { messages, codes } = validatePgSchema(
    undefined,
    schemas,
    tables,
    views,
    materializedViews,
    enums,
    sequences
  );

  expect(messages).length(1);
  expect(codes).contains(Err.PrimaryKeyColumnsMixingTables);
});

// This is just for visualizing the formatted error messages
// test('test', () => {
//   const users = pgTable('users', {
//     id: serial('id').primaryKey(),
//     firstName: text('first_name').notNull(),
//     lastName: text('first_name').notNull(),
//     profileViews: integer('profile_views').notNull().default(0)
//   }, (table) => ({
//     profileViewsIdx: index('views_idx').on(table.profileViews),
//   }))
//   const posts = pgTable('posts', {
//     id: serial('id').primaryKey(),
//     userId: text('user_id').notNull(),
//     title: text('title').notNull(),
//     body: text('body').notNull(),
//     views: integer('views').notNull().default(0),
//     embedding: vector('embedding', { dimensions: 3 })
//   }, (table) => ({
//     viewsIdx: index('views_idx').on(table.views),
//     embeddingIdx: index('embedding_idx').on(table.embedding),
//     fk: foreignKey({
//       columns: [table.userId],
//       foreignColumns: [users.id],
//     })
//   }));
//   const schema = {
//     users,
//     posts
//   };

//   const { schemas, enums, tables, sequences, views, materializedViews } = prepareFromExports(schema);

//   const { messages } = validatePgSchema(
//     'snake_case',
//     schemas,
//     tables,
//     views,
//     materializedViews,
//     enums,
//     sequences
//   );

//   printValidationErrors(messages, false);
//   expect(true).toBeTruthy();
// });