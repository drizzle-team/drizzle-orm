// Test: array column types with new dimension notation
import { integer, pgTable, text } from '~/pg-core/index.ts';
import type { InferInsertModel, InferSelectModel } from '~/table.ts';
import type { Equal } from '../utils.ts';
import { Expect } from '../utils.ts';

// Test 1D array
const table1D = pgTable('table_1d', {
	id: integer().primaryKey(),
	tags: text().array('[]').notNull(),
	scores: integer().array('[]'),
});

// Test 2D array
const table2D = pgTable('table_2d', {
	id: integer().primaryKey(),
	matrix: integer().array('[][]').notNull(),
});

// Test 3D array
const table3D = pgTable('table_3d', {
	id: integer().primaryKey(),
	cube: integer().array('[][][]'),
});

// Infer types
type Table1DSelect = InferSelectModel<typeof table1D>;
type Table1DInsert = InferInsertModel<typeof table1D>;

type Table2DSelect = InferSelectModel<typeof table2D>;
type Table2DInsert = InferInsertModel<typeof table2D>;

type Table3DSelect = InferSelectModel<typeof table3D>;
type _Table3DInsert = InferInsertModel<typeof table3D>;

// 1D array assertions
Expect<Equal<Table1DSelect['tags'], string[]>>();
Expect<Equal<Table1DSelect['scores'], number[] | null>>();

// Insert model - tags should be required (notNull), scores should be optional
Expect<Equal<Table1DInsert['tags'], string[]>>();

// 2D array assertions
Expect<Equal<Table2DSelect['matrix'], number[][]>>();
Expect<Equal<Table2DInsert['matrix'], number[][]>>();

// 3D array assertions (nullable)
Expect<Equal<Table3DSelect['cube'], number[][][] | null>>();

// Test chaining with other modifiers
const tableChained = pgTable('table_chained', {
	id: integer().primaryKey(),
	// array + notNull
	tags: text().array('[]').notNull(),
	// notNull + array (different order) - should still work
	tags2: text().notNull().array('[]'),
});

type TableChainedSelect = InferSelectModel<typeof tableChained>;

// Both should be string[] (not null)
Expect<Equal<TableChainedSelect['tags'], string[]>>();
Expect<Equal<TableChainedSelect['tags2'], string[]>>();

// Test with $type modifier
const tableWithType = pgTable('table_with_type', {
	id: integer().primaryKey(),
	// Should be MyTag[] not string[]
	customTags: text().$type<'tag1' | 'tag2'>().array('[]').notNull(),
});

type TableWithTypeSelect = InferSelectModel<typeof tableWithType>;
Expect<Equal<TableWithTypeSelect['customTags'], ('tag1' | 'tag2')[]>>();

// Test 4D and 5D arrays
const tableHighDim = pgTable('table_high_dim', {
	id: integer().primaryKey(),
	dim4: integer().array('[][][][]').notNull(),
	dim5: integer().array('[][][][][]').notNull(),
});

type TableHighDimSelect = InferSelectModel<typeof tableHighDim>;
Expect<Equal<TableHighDimSelect['dim4'], number[][][][]>>();
Expect<Equal<TableHighDimSelect['dim5'], number[][][][][]>>();
