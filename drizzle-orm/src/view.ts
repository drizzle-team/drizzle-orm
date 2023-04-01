import type { AnyColumn } from './column';
import type { SelectedFields } from './operations';
import type { SQL } from './sql';
import type { Table } from './table';

export const ViewBaseConfig = Symbol('ViewBaseConfig');

export abstract class View<
	TName extends string = string,
	TExisting extends boolean = boolean,
	TSelection = unknown,
> {
	declare _: {
		brand: 'View';
		viewBrand: string;
		name: TName;
		existing: TExisting;
		selectedFields: TSelection;
	};

	/** @internal */
	[ViewBaseConfig]: {
		name: TName;
		schema: string | undefined;
		selectedFields: SelectedFields<AnyColumn, Table>;
		isExisting: TExisting;
		query: TExisting extends true ? undefined : SQL;
	};

	constructor(
		{ name, schema, selectedFields, query }: {
			name: TName;
			schema: string | undefined;
			selectedFields: SelectedFields<AnyColumn, Table>;
			query: SQL | undefined;
		},
	) {
		this[ViewBaseConfig] = {
			name,
			schema,
			selectedFields,
			query: query as (TExisting extends true ? undefined : SQL),
			isExisting: !query as TExisting,
		};
	}
}
