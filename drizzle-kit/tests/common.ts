import { test } from 'vitest';

export interface DialectSuite {
	/**
	 * 1 statement | create column:
	 *
	 * id int primary key autoincrement
	 */
	columns1(): Promise<void>;
}

export const run = (suite: DialectSuite) => {
	test('add columns #1', suite.columns1);
};
// test("add columns #1", suite.columns1)
