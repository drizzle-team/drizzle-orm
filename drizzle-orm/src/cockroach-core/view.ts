import type { BuildColumns, ColumnBuilderBase } from '~/column-builder.ts';
import { entityKind, is } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { AddAliasToSelection } from '~/query-builders/select.types.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { ColumnsSelection, SQL } from '~/sql/sql.ts';
import { getTableColumns } from '~/utils.ts';
import type { CockroachColumn } from './columns/common.ts';
import { QueryBuilder } from './query-builders/query-builder.ts';
import { cockroachTable } from './table.ts';
import { CockroachViewBase } from './view-base.ts';

export class DefaultViewBuilderCore<TConfig extends { name: string; columns?: unknown }> {
	static readonly [entityKind]: string = 'CockroachDefaultViewBuilderCore';

	declare readonly _: {
		readonly name: TConfig['name'];
		readonly columns: TConfig['columns'];
	};

	constructor(
		protected name: TConfig['name'],
		protected schema: string | undefined,
	) {}
}

export class ViewBuilder<TName extends string = string> extends DefaultViewBuilderCore<{ name: TName }> {
	static override readonly [entityKind]: string = 'CockroachViewBuilder';

	as<TSelectedFields extends ColumnsSelection>(
		qb: TypedQueryBuilder<TSelectedFields> | ((qb: QueryBuilder) => TypedQueryBuilder<TSelectedFields>),
	): CockroachViewWithSelection<TName, false, AddAliasToSelection<TSelectedFields, TName, 'cockroach'>> {
		if (typeof qb === 'function') {
			qb = qb(new QueryBuilder());
		}
		const selectionProxy = new SelectionProxyHandler<TSelectedFields>({
			alias: this.name,
			sqlBehavior: 'error',
			sqlAliasedBehavior: 'alias',
			replaceOriginalName: true,
		});
		const aliasedSelection = new Proxy(qb.getSelectedFields(), selectionProxy);
		return new Proxy(
			new CockroachView({
				config: {
					name: this.name,
					schema: this.schema,
					selectedFields: aliasedSelection,
					query: qb.getSQL().inlineParams(),
				},
			}),
			selectionProxy as any,
		) as CockroachViewWithSelection<TName, false, AddAliasToSelection<TSelectedFields, TName, 'cockroach'>>;
	}
}

export class ManualViewBuilder<
	TName extends string = string,
	TColumns extends Record<string, ColumnBuilderBase> = Record<string, ColumnBuilderBase>,
> extends DefaultViewBuilderCore<{ name: TName; columns: TColumns }> {
	static override readonly [entityKind]: string = 'CockroachManualViewBuilder';

	private columns: Record<string, CockroachColumn>;

	constructor(
		name: TName,
		columns: TColumns,
		schema: string | undefined,
	) {
		super(name, schema);
		this.columns = getTableColumns(cockroachTable(name, columns));
	}

	existing(): CockroachViewWithSelection<TName, true, BuildColumns<TName, TColumns, 'cockroach'>> {
		return new Proxy(
			new CockroachView({
				config: {
					name: this.name,
					schema: this.schema,
					selectedFields: this.columns,
					query: undefined,
				},
			}),
			new SelectionProxyHandler({
				alias: this.name,
				sqlBehavior: 'error',
				sqlAliasedBehavior: 'alias',
				replaceOriginalName: true,
			}),
		) as CockroachViewWithSelection<TName, true, BuildColumns<TName, TColumns, 'cockroach'>>;
	}

	as(query: SQL): CockroachViewWithSelection<TName, false, BuildColumns<TName, TColumns, 'cockroach'>> {
		return new Proxy(
			new CockroachView({
				config: {
					name: this.name,
					schema: this.schema,
					selectedFields: this.columns,
					query: query.inlineParams(),
				},
			}),
			new SelectionProxyHandler({
				alias: this.name,
				sqlBehavior: 'error',
				sqlAliasedBehavior: 'alias',
				replaceOriginalName: true,
			}),
		) as CockroachViewWithSelection<TName, false, BuildColumns<TName, TColumns, 'cockroach'>>;
	}
}

export class MaterializedViewBuilderCore<TConfig extends { name: string; columns?: unknown }> {
	static readonly [entityKind]: string = 'CockroachMaterializedViewBuilderCore';

	declare _: {
		readonly name: TConfig['name'];
		readonly columns: TConfig['columns'];
	};

	constructor(
		protected name: TConfig['name'],
		protected schema: string | undefined,
	) {}

	protected config: {
		withNoData?: boolean;
	} = {};

	withNoData(): this {
		this.config.withNoData = true;
		return this;
	}
}

export class MaterializedViewBuilder<TName extends string = string>
	extends MaterializedViewBuilderCore<{ name: TName }>
{
	static override readonly [entityKind]: string = 'CockroachMaterializedViewBuilder';

	as<TSelectedFields extends ColumnsSelection>(
		qb: TypedQueryBuilder<TSelectedFields> | ((qb: QueryBuilder) => TypedQueryBuilder<TSelectedFields>),
	): CockroachMaterializedViewWithSelection<
		TName,
		false,
		AddAliasToSelection<TSelectedFields, TName, 'cockroach'>
	> {
		if (typeof qb === 'function') {
			qb = qb(new QueryBuilder());
		}
		const selectionProxy = new SelectionProxyHandler<TSelectedFields>({
			alias: this.name,
			sqlBehavior: 'error',
			sqlAliasedBehavior: 'alias',
			replaceOriginalName: true,
		});
		const aliasedSelection = new Proxy(qb.getSelectedFields(), selectionProxy);
		return new Proxy(
			new CockroachMaterializedView({
				cockroachConfig: {
					withNoData: this.config.withNoData,
				},
				config: {
					name: this.name,
					schema: this.schema,
					selectedFields: aliasedSelection,
					query: qb.getSQL().inlineParams(),
				},
			}),
			selectionProxy as any,
		) as CockroachMaterializedViewWithSelection<
			TName,
			false,
			AddAliasToSelection<TSelectedFields, TName, 'cockroach'>
		>;
	}
}

export class ManualMaterializedViewBuilder<
	TName extends string = string,
	TColumns extends Record<string, ColumnBuilderBase> = Record<string, ColumnBuilderBase>,
> extends MaterializedViewBuilderCore<{ name: TName; columns: TColumns }> {
	static override readonly [entityKind]: string = 'CockroachManualMaterializedViewBuilder';

	private columns: Record<string, CockroachColumn>;

	constructor(
		name: TName,
		columns: TColumns,
		schema: string | undefined,
	) {
		super(name, schema);
		this.columns = getTableColumns(cockroachTable(name, columns));
	}

	existing(): CockroachMaterializedViewWithSelection<TName, true, BuildColumns<TName, TColumns, 'cockroach'>> {
		return new Proxy(
			new CockroachMaterializedView({
				cockroachConfig: {
					withNoData: this.config.withNoData,
				},
				config: {
					name: this.name,
					schema: this.schema,
					selectedFields: this.columns,
					query: undefined,
				},
			}),
			new SelectionProxyHandler({
				alias: this.name,
				sqlBehavior: 'error',
				sqlAliasedBehavior: 'alias',
				replaceOriginalName: true,
			}),
		) as CockroachMaterializedViewWithSelection<TName, true, BuildColumns<TName, TColumns, 'cockroach'>>;
	}

	as(query: SQL): CockroachMaterializedViewWithSelection<TName, false, BuildColumns<TName, TColumns, 'cockroach'>> {
		return new Proxy(
			new CockroachMaterializedView({
				cockroachConfig: {
					withNoData: this.config.withNoData,
				},
				config: {
					name: this.name,
					schema: this.schema,
					selectedFields: this.columns,
					query: query.inlineParams(),
				},
			}),
			new SelectionProxyHandler({
				alias: this.name,
				sqlBehavior: 'error',
				sqlAliasedBehavior: 'alias',
				replaceOriginalName: true,
			}),
		) as CockroachMaterializedViewWithSelection<TName, false, BuildColumns<TName, TColumns, 'cockroach'>>;
	}
}

export class CockroachView<
	TName extends string = string,
	TExisting extends boolean = boolean,
	TSelectedFields extends ColumnsSelection = ColumnsSelection,
> extends CockroachViewBase<TName, TExisting, TSelectedFields> {
	static override readonly [entityKind]: string = 'CockroachView';

	constructor({ config }: {
		config: {
			name: TName;
			schema: string | undefined;
			selectedFields: ColumnsSelection;
			query: SQL | undefined;
		};
	}) {
		super(config);
	}
}

export type CockroachViewWithSelection<
	TName extends string = string,
	TExisting extends boolean = boolean,
	TSelectedFields extends ColumnsSelection = ColumnsSelection,
> = CockroachView<TName, TExisting, TSelectedFields> & TSelectedFields;

export const CockroachMaterializedViewConfig = Symbol.for('drizzle:CockroachMaterializedViewConfig');

export class CockroachMaterializedView<
	TName extends string = string,
	TExisting extends boolean = boolean,
	TSelectedFields extends ColumnsSelection = ColumnsSelection,
> extends CockroachViewBase<TName, TExisting, TSelectedFields> {
	static override readonly [entityKind]: string = 'CockroachMaterializedView';

	readonly [CockroachMaterializedViewConfig]: {
		readonly withNoData?: boolean;
	} | undefined;

	constructor({ cockroachConfig, config }: {
		cockroachConfig: {
			withNoData: boolean | undefined;
		} | undefined;
		config: {
			name: TName;
			schema: string | undefined;
			selectedFields: ColumnsSelection;
			query: SQL | undefined;
		};
	}) {
		super(config);
		this[CockroachMaterializedViewConfig] = {
			withNoData: cockroachConfig?.withNoData,
		};
	}
}

export type CockroachMaterializedViewWithSelection<
	TName extends string = string,
	TExisting extends boolean = boolean,
	TSelectedFields extends ColumnsSelection = ColumnsSelection,
> = CockroachMaterializedView<TName, TExisting, TSelectedFields> & TSelectedFields;

/** @internal */
export function cockroachViewWithSchema(
	name: string,
	selection: Record<string, ColumnBuilderBase> | undefined,
	schema: string | undefined,
): ViewBuilder | ManualViewBuilder {
	if (selection) {
		return new ManualViewBuilder(name, selection, schema);
	}
	return new ViewBuilder(name, schema);
}

/** @internal */
export function cockroachMaterializedViewWithSchema(
	name: string,
	selection: Record<string, ColumnBuilderBase> | undefined,
	schema: string | undefined,
): MaterializedViewBuilder | ManualMaterializedViewBuilder {
	if (selection) {
		return new ManualMaterializedViewBuilder(name, selection, schema);
	}
	return new MaterializedViewBuilder(name, schema);
}

export function cockroachView<TName extends string>(name: TName): ViewBuilder<TName>;
export function cockroachView<TName extends string, TColumns extends Record<string, ColumnBuilderBase>>(
	name: TName,
	columns: TColumns,
): ManualViewBuilder<TName, TColumns>;
export function cockroachView(
	name: string,
	columns?: Record<string, ColumnBuilderBase>,
): ViewBuilder | ManualViewBuilder {
	return cockroachViewWithSchema(name, columns, undefined);
}

export function cockroachMaterializedView<TName extends string>(name: TName): MaterializedViewBuilder<TName>;
export function cockroachMaterializedView<
	TName extends string,
	TColumns extends Record<string, ColumnBuilderBase>,
>(
	name: TName,
	columns: TColumns,
): ManualMaterializedViewBuilder<TName, TColumns>;
export function cockroachMaterializedView(
	name: string,
	columns?: Record<string, ColumnBuilderBase>,
): MaterializedViewBuilder | ManualMaterializedViewBuilder {
	return cockroachMaterializedViewWithSchema(name, columns, undefined);
}

export function isCockroachView(obj: unknown): obj is CockroachView {
	return is(obj, CockroachView);
}

export function isCockroachMaterializedView(obj: unknown): obj is CockroachMaterializedView {
	return is(obj, CockroachMaterializedView);
}
