import { ViewBaseConfig } from '~/view-common.ts';
import type { Check } from './checks.ts';
import type { AnyDSQLColumn } from './columns/common.ts';
import type { Index } from './indexes.ts';
import type { PrimaryKey } from './primary-keys.ts';
import type { DSQLTable } from './table.ts';
import type { UniqueConstraint } from './unique-constraint.ts';
import type { DSQLView } from './view.ts';
import { DSQLViewConfig } from './view-common.ts';

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

export function getViewConfig<
	TName extends string = string,
	TExisting extends boolean = boolean,
>(view: DSQLView<TName, TExisting>): {
	name: TName;
	schema: string | undefined;
	isExisting: TExisting;
	query: unknown;
	selectedFields: Record<string, unknown>;
} {
	return {
		...view[ViewBaseConfig],
		...view[DSQLViewConfig],
	} as any;
}
