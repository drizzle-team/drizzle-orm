import type { BuildColumns } from '~/column-builder.ts';
import { entityKind, is } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { AddAliasToSelection } from '~/query-builders/select.types.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { ColumnsSelection, SQL } from '~/sql/sql.ts';
import { getTableColumns } from '~/utils.ts';
import type { CockroachDbColumn, CockroachDbColumnBuilderBase } from './columns/common.ts';
import { QueryBuilder } from './query-builders/query-builder.ts';
import { cockroachdbTable } from './table.ts';
import { CockroachDbViewBase } from './view-base.ts';

export class DefaultViewBuilderCore<TConfig extends { name: string; columns?: unknown }> {
	static readonly [entityKind]: string = 'CockroachDbDefaultViewBuilderCore';

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
	static override readonly [entityKind]: string = 'CockroachDbViewBuilder';

	as<TSelectedFields extends ColumnsSelection>(
		qb: TypedQueryBuilder<TSelectedFields> | ((qb: QueryBuilder) => TypedQueryBuilder<TSelectedFields>),
	): CockroachDbViewWithSelection<TName, false, AddAliasToSelection<TSelectedFields, TName, 'cockroachdb'>> {
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
			new CockroachDbView({
				config: {
					name: this.name,
					schema: this.schema,
					selectedFields: aliasedSelection,
					query: qb.getSQL().inlineParams(),
				},
			}),
			selectionProxy as any,
		) as CockroachDbViewWithSelection<TName, false, AddAliasToSelection<TSelectedFields, TName, 'cockroachdb'>>;
	}
}

export class ManualViewBuilder<
	TName extends string = string,
	TColumns extends Record<string, CockroachDbColumnBuilderBase> = Record<string, CockroachDbColumnBuilderBase>,
> extends DefaultViewBuilderCore<{ name: TName; columns: TColumns }> {
	static override readonly [entityKind]: string = 'CockroachDbManualViewBuilder';

	private columns: Record<string, CockroachDbColumn>;

	constructor(
		name: TName,
		columns: TColumns,
		schema: string | undefined,
	) {
		super(name, schema);
		this.columns = getTableColumns(cockroachdbTable(name, columns));
	}

	existing(): CockroachDbViewWithSelection<TName, true, BuildColumns<TName, TColumns, 'cockroachdb'>> {
		return new Proxy(
			new CockroachDbView({
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
		) as CockroachDbViewWithSelection<TName, true, BuildColumns<TName, TColumns, 'cockroachdb'>>;
	}

	as(query: SQL): CockroachDbViewWithSelection<TName, false, BuildColumns<TName, TColumns, 'cockroachdb'>> {
		return new Proxy(
			new CockroachDbView({
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
		) as CockroachDbViewWithSelection<TName, false, BuildColumns<TName, TColumns, 'cockroachdb'>>;
	}
}

export class MaterializedViewBuilderCore<TConfig extends { name: string; columns?: unknown }> {
	static readonly [entityKind]: string = 'CockroachDbMaterializedViewBuilderCore';

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
	static override readonly [entityKind]: string = 'CockroachDbMaterializedViewBuilder';

	as<TSelectedFields extends ColumnsSelection>(
		qb: TypedQueryBuilder<TSelectedFields> | ((qb: QueryBuilder) => TypedQueryBuilder<TSelectedFields>),
	): CockroachDbMaterializedViewWithSelection<
		TName,
		false,
		AddAliasToSelection<TSelectedFields, TName, 'cockroachdb'>
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
			new CockroachDbMaterializedView({
				cockroachdbConfig: {
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
		) as CockroachDbMaterializedViewWithSelection<
			TName,
			false,
			AddAliasToSelection<TSelectedFields, TName, 'cockroachdb'>
		>;
	}
}

export class ManualMaterializedViewBuilder<
	TName extends string = string,
	TColumns extends Record<string, CockroachDbColumnBuilderBase> = Record<string, CockroachDbColumnBuilderBase>,
> extends MaterializedViewBuilderCore<{ name: TName; columns: TColumns }> {
	static override readonly [entityKind]: string = 'CockroachDbManualMaterializedViewBuilder';

	private columns: Record<string, CockroachDbColumn>;

	constructor(
		name: TName,
		columns: TColumns,
		schema: string | undefined,
	) {
		super(name, schema);
		this.columns = getTableColumns(cockroachdbTable(name, columns));
	}

	existing(): CockroachDbMaterializedViewWithSelection<TName, true, BuildColumns<TName, TColumns, 'cockroachdb'>> {
		return new Proxy(
			new CockroachDbMaterializedView({
				cockroachdbConfig: {
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
		) as CockroachDbMaterializedViewWithSelection<TName, true, BuildColumns<TName, TColumns, 'cockroachdb'>>;
	}

	as(query: SQL): CockroachDbMaterializedViewWithSelection<TName, false, BuildColumns<TName, TColumns, 'cockroachdb'>> {
		return new Proxy(
			new CockroachDbMaterializedView({
				cockroachdbConfig: {
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
		) as CockroachDbMaterializedViewWithSelection<TName, false, BuildColumns<TName, TColumns, 'cockroachdb'>>;
	}
}

export class CockroachDbView<
	TName extends string = string,
	TExisting extends boolean = boolean,
	TSelectedFields extends ColumnsSelection = ColumnsSelection,
> extends CockroachDbViewBase<TName, TExisting, TSelectedFields> {
	static override readonly [entityKind]: string = 'CockroachDbView';

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

export type CockroachDbViewWithSelection<
	TName extends string = string,
	TExisting extends boolean = boolean,
	TSelectedFields extends ColumnsSelection = ColumnsSelection,
> = CockroachDbView<TName, TExisting, TSelectedFields> & TSelectedFields;

export const CockroachDbMaterializedViewConfig = Symbol.for('drizzle:CockroachDbMaterializedViewConfig');

export class CockroachDbMaterializedView<
	TName extends string = string,
	TExisting extends boolean = boolean,
	TSelectedFields extends ColumnsSelection = ColumnsSelection,
> extends CockroachDbViewBase<TName, TExisting, TSelectedFields> {
	static override readonly [entityKind]: string = 'CockroachDbMaterializedView';

	readonly [CockroachDbMaterializedViewConfig]: {
		readonly withNoData?: boolean;
	} | undefined;

	constructor({ cockroachdbConfig, config }: {
		cockroachdbConfig: {
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
		this[CockroachDbMaterializedViewConfig] = {
			withNoData: cockroachdbConfig?.withNoData,
		};
	}
}

export type CockroachDbMaterializedViewWithSelection<
	TName extends string = string,
	TExisting extends boolean = boolean,
	TSelectedFields extends ColumnsSelection = ColumnsSelection,
> = CockroachDbMaterializedView<TName, TExisting, TSelectedFields> & TSelectedFields;

/** @internal */
export function cockroachdbViewWithSchema(
	name: string,
	selection: Record<string, CockroachDbColumnBuilderBase> | undefined,
	schema: string | undefined,
): ViewBuilder | ManualViewBuilder {
	if (selection) {
		return new ManualViewBuilder(name, selection, schema);
	}
	return new ViewBuilder(name, schema);
}

/** @internal */
export function cockroachdbMaterializedViewWithSchema(
	name: string,
	selection: Record<string, CockroachDbColumnBuilderBase> | undefined,
	schema: string | undefined,
): MaterializedViewBuilder | ManualMaterializedViewBuilder {
	if (selection) {
		return new ManualMaterializedViewBuilder(name, selection, schema);
	}
	return new MaterializedViewBuilder(name, schema);
}

export function cockroachdbView<TName extends string>(name: TName): ViewBuilder<TName>;
export function cockroachdbView<TName extends string, TColumns extends Record<string, CockroachDbColumnBuilderBase>>(
	name: TName,
	columns: TColumns,
): ManualViewBuilder<TName, TColumns>;
export function cockroachdbView(
	name: string,
	columns?: Record<string, CockroachDbColumnBuilderBase>,
): ViewBuilder | ManualViewBuilder {
	return cockroachdbViewWithSchema(name, columns, undefined);
}

export function cockroachdbMaterializedView<TName extends string>(name: TName): MaterializedViewBuilder<TName>;
export function cockroachdbMaterializedView<
	TName extends string,
	TColumns extends Record<string, CockroachDbColumnBuilderBase>,
>(
	name: TName,
	columns: TColumns,
): ManualMaterializedViewBuilder<TName, TColumns>;
export function cockroachdbMaterializedView(
	name: string,
	columns?: Record<string, CockroachDbColumnBuilderBase>,
): MaterializedViewBuilder | ManualMaterializedViewBuilder {
	return cockroachdbMaterializedViewWithSchema(name, columns, undefined);
}

export function isCockroachDbView(obj: unknown): obj is CockroachDbView {
	return is(obj, CockroachDbView);
}

export function isCockroachDbMaterializedView(obj: unknown): obj is CockroachDbMaterializedView {
	return is(obj, CockroachDbMaterializedView);
}
