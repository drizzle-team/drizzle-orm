import type { Casing } from '~/casing.ts';
import type { BuildColumns, ColumnBuilderBase } from '~/column-builder.ts';
import { entityKind } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { AddAliasToSelection } from '~/query-builders/select.types.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { SQL } from '~/sql/sql.ts';
import { getTableColumns } from '~/utils.ts';
import type { UpdateViewConfig, ViewConfig } from '~/view.ts';
import type { MsSqlColumn } from './columns/index.ts';
import { QueryBuilder } from './query-builders/query-builder.ts';
import type { SelectedFields } from './query-builders/select.types.ts';
import { mssqlTableWithSchema } from './table.ts';
import { MsSqlViewBase } from './view-base.ts';
import { MsSqlViewConfig } from './view-common.ts';

export interface ViewBuilderConfig {
	encryption?: boolean;
	schemaBinding?: boolean;
	viewMetadata?: boolean;
	checkOption?: boolean;
}

export class ViewBuilderCore<
	TConfig extends { name: string; columns?: unknown },
	TSchema extends string | undefined = undefined,
> {
	static readonly [entityKind]: string = 'MsSqlViewBuilder';

	declare readonly _: {
		readonly name: TConfig['name'];
		readonly columns: TConfig['columns'];
	};

	constructor(
		protected name: TConfig['name'],
		protected schema: TSchema,
	) {}

	protected config: ViewBuilderConfig = {
		encryption: false,
		schemaBinding: false,
		viewMetadata: false,
	};

	with(
		config?: ViewBuilderConfig,
	): this {
		this.config.encryption = config?.encryption;
		this.config.schemaBinding = config?.schemaBinding;
		this.config.viewMetadata = config?.viewMetadata;
		this.config.checkOption = config?.checkOption;
		return this;
	}
}

export class ViewBuilder<
	TName extends string = string,
	TSchema extends string | undefined = undefined,
> extends ViewBuilderCore<{ name: TName }, TSchema> {
	static override readonly [entityKind]: string = 'MsSqlViewBuilder';

	as<TSelectedFields extends SelectedFields>(
		qb: TypedQueryBuilder<TSelectedFields> | ((qb: QueryBuilder) => TypedQueryBuilder<TSelectedFields>),
	): MsSqlViewWithSelection<
		{
			name: TName;
			schema: TSchema;
			existing: false;
			isAlias: false;
			selectedFields: AddAliasToSelection<TSelectedFields, TName, 'mssql'>;
		}
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
			new MsSqlView({
				mssqlConfig: this.config,
				config: {
					name: this.name,
					schema: this.schema,
					selectedFields: aliasedSelection,
					query: qb.withoutSelectionCastCodecs().getSQL().inlineParams(),
				},
			}),
			selectionProxy as any,
		) as MsSqlViewWithSelection<
			{
				name: TName;
				schema: TSchema;
				existing: false;
				isAlias: false;
				selectedFields: AddAliasToSelection<TSelectedFields, TName, 'mssql'>;
			}
		>;
	}
}

export class ManualViewBuilder<
	TName extends string = string,
	TColumns extends Record<string, ColumnBuilderBase> = Record<string, ColumnBuilderBase>,
	TSchema extends string | undefined = undefined,
> extends ViewBuilderCore<{ name: TName; columns: TColumns }, TSchema> {
	static override readonly [entityKind]: string = 'MsSqlManualViewBuilder';

	private columns: Record<string, MsSqlColumn>;

	constructor(
		name: TName,
		columns: TColumns,
		schema: TSchema,
		casing: Casing | undefined,
	) {
		super(name, schema);
		this.columns = getTableColumns(
			mssqlTableWithSchema(name, columns, undefined, schema, casing),
		) as BuildColumns<TName, TColumns, 'mssql'>;
	}

	existing(): MsSqlViewWithSelection<
		{
			name: TName;
			schema: TSchema;
			existing: true;
			isAlias: false;
			selectedFields: BuildColumns<TName, TColumns, 'mssql'>;
		}
	> {
		return new Proxy(
			new MsSqlView({
				mssqlConfig: undefined,
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
		) as MsSqlViewWithSelection<
			{
				name: TName;
				schema: TSchema;
				existing: true;
				isAlias: false;
				selectedFields: BuildColumns<TName, TColumns, 'mssql'>;
			}
		>;
	}

	as(
		query: SQL,
	): MsSqlViewWithSelection<
		{
			name: TName;
			schema: TSchema;
			existing: false;
			isAlias: false;
			selectedFields: BuildColumns<TName, TColumns, 'mssql'>;
		}
	> {
		return new Proxy(
			new MsSqlView({
				mssqlConfig: this.config,
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
		) as MsSqlViewWithSelection<
			{
				name: TName;
				schema: TSchema;
				existing: false;
				isAlias: false;
				selectedFields: BuildColumns<TName, TColumns, 'mssql'>;
			}
		>;
	}
}

export class MsSqlView<T extends ViewConfig = ViewConfig> extends MsSqlViewBase<T> {
	static override readonly [entityKind]: string = 'MsSqlView';

	declare protected $MsSqlViewBrand: 'MsSqlView';

	[MsSqlViewConfig]: ViewBuilderConfig | undefined;

	constructor({ mssqlConfig, config }: {
		mssqlConfig: ViewBuilderConfig | undefined;
		config: {
			name: T['name'];
			schema: T['schema'];
			selectedFields: SelectedFields;
			query: SQL | undefined;
		};
	}) {
		super(config);
		this[MsSqlViewConfig] = mssqlConfig;
	}
}

export type MsSqlViewWithSelection<T extends ViewConfig> = MsSqlView<T> & T['selectedFields'];

/**
 * Any SQL Server view with a specified boundary, e.g. `AnyMsSqlView<{ name: 'my_view' }>`.
 *
 * To describe any view with any config, use `MsSqlView` without type arguments.
 */
export type AnyMsSqlView<TPartial extends Partial<ViewConfig> = {}> = MsSqlView<UpdateViewConfig<ViewConfig, TPartial>>;

/** @internal */
export function mssqlViewWithSchema<TSchema extends string | undefined>(
	name: string,
	selection: Record<string, ColumnBuilderBase> | undefined,
	schema: TSchema,
	casing: Casing | undefined,
): ViewBuilder<string, TSchema> | ManualViewBuilder<string, Record<string, ColumnBuilderBase>, TSchema> {
	if (selection) {
		return new ManualViewBuilder(name, selection, schema, casing);
	}
	return new ViewBuilder(name, schema);
}

export interface MsSqlViewFn<TSchema extends string | undefined = undefined> {
	<TName extends string>(name: TName): ViewBuilder<TName, TSchema>;
	<TName extends string, TColumns extends Record<string, ColumnBuilderBase>>(
		name: TName,
		columns: TColumns,
	): ManualViewBuilder<TName, TColumns, TSchema>;
}

/** @internal */
export function mssqlViewWithCasing(casing: Casing | undefined): MsSqlViewFn {
	return ((name, columns) => mssqlViewWithSchema(name, columns, undefined, casing)) as MsSqlViewFn;
}

export const mssqlView = mssqlViewWithCasing(undefined);
