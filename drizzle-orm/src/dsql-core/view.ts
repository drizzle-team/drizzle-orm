import { entityKind, is } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { AddAliasToSelection } from '~/query-builders/select.types.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { ColumnsSelection, SQL } from '~/sql/sql.ts';
import { getTableColumns } from '~/utils.ts';
import type { RequireAtLeastOne } from '~/utils.ts';
import type { AnyDSQLColumnBuilder, DSQLBuildColumns, DSQLColumn } from './columns/common.ts';
import { dsqlTable } from './table.ts';
import { DSQLViewBase } from './view-base.ts';
import { DSQLViewConfig } from './view-common.ts';

export type ViewWithConfig = RequireAtLeastOne<{
	checkOption: 'local' | 'cascaded';
	securityBarrier: boolean;
	securityInvoker: boolean;
}>;

export class DefaultViewBuilderCore<TConfig extends { name: string; columns?: unknown }> {
	static readonly [entityKind]: string = 'DSQLDefaultViewBuilderCore';

	declare readonly _: {
		readonly name: TConfig['name'];
		readonly columns: TConfig['columns'];
	};

	constructor(
		protected name: TConfig['name'],
		protected schema: string | undefined,
	) {}

	protected config: {
		with?: ViewWithConfig;
	} = {};

	with(config: ViewWithConfig): this {
		this.config.with = config;
		return this;
	}
}

export class ViewBuilder<TName extends string = string> extends DefaultViewBuilderCore<{ name: TName }> {
	static override readonly [entityKind]: string = 'DSQLViewBuilder';

	as<TSelectedFields extends ColumnsSelection>(
		qb: TypedQueryBuilder<TSelectedFields> | ((qb: any) => TypedQueryBuilder<TSelectedFields>),
	): DSQLViewWithSelection<TName, false, AddAliasToSelection<TSelectedFields, TName, 'pg'>> {
		throw new Error('Method not implemented.');
	}
}

export class ManualViewBuilder<
	TName extends string = string,
	TColumns extends Record<string, AnyDSQLColumnBuilder> = Record<string, AnyDSQLColumnBuilder>,
> extends DefaultViewBuilderCore<{ name: TName; columns: TColumns }> {
	static override readonly [entityKind]: string = 'DSQLManualViewBuilder';

	private columns: Record<string, DSQLColumn>;

	constructor(
		name: TName,
		columns: TColumns,
		schema: string | undefined,
	) {
		super(name, schema);
		this.columns = getTableColumns(dsqlTable(name, columns)) as Record<string, DSQLColumn>;
	}

	existing(): DSQLViewWithSelection<TName, true, DSQLBuildColumns<TName, TColumns>> {
		throw new Error('Method not implemented.');
	}

	as(query: SQL): DSQLViewWithSelection<TName, false, DSQLBuildColumns<TName, TColumns>> {
		throw new Error('Method not implemented.');
	}
}

export class DSQLView<
	TName extends string = string,
	TExisting extends boolean = boolean,
	TSelectedFields extends ColumnsSelection = ColumnsSelection,
> extends DSQLViewBase<TName, TExisting, TSelectedFields> {
	static override readonly [entityKind]: string = 'DSQLView';

	[DSQLViewConfig]: {
		with?: ViewWithConfig;
	} | undefined;

	constructor({ dsqlConfig, config }: {
		dsqlConfig: {
			with?: ViewWithConfig;
		} | undefined;
		config: {
			name: TName;
			schema: string | undefined;
			selectedFields: ColumnsSelection;
			query: SQL | undefined;
		};
	}) {
		super(config);
		if (dsqlConfig) {
			this[DSQLViewConfig] = {
				with: dsqlConfig.with,
			};
		}
	}
}

export type DSQLViewWithSelection<
	TName extends string = string,
	TExisting extends boolean = boolean,
	TSelectedFields extends ColumnsSelection = ColumnsSelection,
> = DSQLView<TName, TExisting, TSelectedFields> & TSelectedFields;

/** @internal */
export function dsqlViewWithSchema(
	name: string,
	selection: Record<string, AnyDSQLColumnBuilder> | undefined,
	schema: string | undefined,
): ViewBuilder | ManualViewBuilder {
	if (selection) {
		return new ManualViewBuilder(name, selection, schema);
	}
	return new ViewBuilder(name, schema);
}

export function dsqlView<TName extends string>(name: TName): ViewBuilder<TName>;
export function dsqlView<TName extends string, TColumns extends Record<string, AnyDSQLColumnBuilder>>(
	name: TName,
	columns: TColumns,
): ManualViewBuilder<TName, TColumns>;
export function dsqlView(
	name: string,
	columns?: Record<string, AnyDSQLColumnBuilder>,
): ViewBuilder | ManualViewBuilder {
	return dsqlViewWithSchema(name, columns, undefined);
}

export function isDSQLView(obj: unknown): obj is DSQLView {
	return is(obj, DSQLView);
}
