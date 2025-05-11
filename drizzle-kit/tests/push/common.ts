import { afterAll, beforeAll, beforeEach, test } from 'vitest';

export interface DialectSuite {
	allTypes(context?: any): Promise<void>;
	addBasicIndexes(context?: any): Promise<void>;
	changeIndexFields(context?: any): Promise<void>;
	dropIndex(context?: any): Promise<void>;
	indexesToBeNotTriggered(context?: any): Promise<void>;
	indexesTestCase1(context?: any): Promise<void>;
	addNotNull(context?: any): Promise<void>;
	addNotNullWithDataNoRollback(context?: any): Promise<void>;
	addBasicSequences(context?: any): Promise<void>;
	addGeneratedColumn(context?: any): Promise<void>;
	addGeneratedToColumn(context?: any): Promise<void>;
	dropGeneratedConstraint(context?: any): Promise<void>;
	alterGeneratedConstraint(context?: any): Promise<void>;
	createTableWithGeneratedConstraint(context?: any): Promise<void>;
	createCompositePrimaryKey(context?: any): Promise<void>;
	renameTableWithCompositePrimaryKey(context?: any): Promise<void>;
	case1(): Promise<void>;
}

export const run = (
	suite: DialectSuite,
	beforeAllFn?: (context: any) => Promise<void>,
	afterAllFn?: (context: any) => Promise<void>,
	beforeEachFn?: (context: any) => Promise<void>,
) => {
	let context: any = {};
	beforeAll(beforeAllFn ? () => beforeAllFn(context) : () => {});

	beforeEach(beforeEachFn ? () => beforeEachFn(context) : () => {});

	test('No diffs for all database types', () => suite.allTypes(context));
	test('Adding basic indexes', () => suite.addBasicIndexes(context));
	test('Dropping basic index', () => suite.dropIndex(context));
	test('Altering indexes', () => suite.changeIndexFields(context));
	test('Indexes properties that should not trigger push changes', () => suite.indexesToBeNotTriggered(context));
	test('Indexes test case #1', () => suite.indexesTestCase1(context));
	test('Drop column', () => suite.case1());
	test('Add not null to a column', () => suite.addNotNull());
	test('Add not null to a column with null data. Should rollback', () => suite.addNotNullWithDataNoRollback());
	test('Add basic sequences', () => suite.addBasicSequences());
	test('Add generated column', () => suite.addGeneratedColumn(context));
	test('Add generated constraint to an existing column', () => suite.addGeneratedToColumn(context));
	test('Drop generated constraint from a column', () => suite.dropGeneratedConstraint(context));
	// should ignore on push
	test('Alter generated constraint', () => suite.alterGeneratedConstraint(context));
	test('Create table with generated column', () => suite.createTableWithGeneratedConstraint(context));
	test('Rename table with composite primary key', () => suite.renameTableWithCompositePrimaryKey(context));

	test('Create composite primary key', () => suite.createCompositePrimaryKey(context));

	afterAll(afterAllFn ? () => afterAllFn(context) : () => {});
};
