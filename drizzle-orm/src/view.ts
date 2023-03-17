import type { AnyColumn } from './column';
import type { SelectFields } from './operations';
import type { SQL } from './sql';
import type { Table } from './table';

export const ViewBaseConfig = Symbol('ViewBaseConfig');

export abstract class View<
	TAlias extends string = string,
	TExisting extends boolean = boolean,
> {
	declare protected $brand: 'View';
	declare protected $existing: TExisting;
	protected abstract $viewBrand: string;

	/** @internal */
	[ViewBaseConfig]: {
		name: TAlias;
		schema: string | undefined;
		selection: SelectFields<AnyColumn, Table>;
		isExisting: TExisting;
		query: TExisting extends true ? undefined : SQL;
	};

	constructor(
		{ name, schema, selection, query }: {
			name: TAlias;
			schema: string | undefined;
			selection: SelectFields<AnyColumn, Table>;
			query: SQL | undefined;
		},
	) {
		this[ViewBaseConfig] = {
			name,
			schema,
			selection,
			query: query as (TExisting extends true ? undefined : SQL),
			isExisting: !query as TExisting,
		};
	}
}
