import type { Check } from './checks.ts';
import type { AnyDSQLColumn } from './columns/common.ts';
import type { Index } from './indexes.ts';
import type { PrimaryKey } from './primary-keys.ts';
import type { DSQLTable } from './table.ts';
import type { UniqueConstraint } from './unique-constraint.ts';

export function getTableConfig(_table: DSQLTable): {
	columns: AnyDSQLColumn[];
	indexes: Index[];
	checks: Check[];
	primaryKeys: PrimaryKey[];
	uniqueConstraints: UniqueConstraint[];
	name: string;
	schema: string | undefined;
} {
	throw new Error('Method not implemented.');
}
