import { afterAll, beforeAll, test } from 'vitest';

export interface DialectSuite {
	simpleIndex(context?: any): Promise<void>;
	vectorIndex(context?: any): Promise<void>;
	indexesToBeTriggered(context?: any): Promise<void>;
}

export const run = (
	suite: DialectSuite,
	beforeAllFn?: (context: any) => Promise<void>,
	afterAllFn?: (context: any) => Promise<void>,
) => {
	let context: any = {};
	beforeAll(beforeAllFn ? () => beforeAllFn(context) : () => {});
	test('index #1: simple index', () => suite.simpleIndex(context));
	test('index #2: vector index', () => suite.vectorIndex(context));
	test('index #3: fields that should be triggered on generate and not triggered on push', () =>
		suite.indexesToBeTriggered(context));
	afterAll(afterAllFn ? () => afterAllFn(context) : () => {});
};
