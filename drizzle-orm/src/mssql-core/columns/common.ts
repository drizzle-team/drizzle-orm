import { ColumnBuilder } from '~/column-builder.ts';
import type {
	ColumnBuilderBaseConfig,
	ColumnBuilderExtraConfig,
	ColumnBuilderRuntimeConfig,
	ColumnType,
	HasGenerated,
	NotNull,
} from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { Column } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { ForeignKey, UpdateDeleteAction } from '~/mssql-core/foreign-keys.ts';
import { ForeignKeyBuilder } from '~/mssql-core/foreign-keys.ts';
import type { AnyMsSqlTable, MsSqlTable } from '~/mssql-core/table.ts';
import type { SQL } from '~/sql/index.ts';
import type { Update } from '~/utils.ts';

export type MsSqlColumns = Record<string, MsSqlColumn<any>>;

export interface ReferenceConfig {
	ref: () => MsSqlColumn;
	actions: {
		onUpdate?: UpdateDeleteAction;
		onDelete?: UpdateDeleteAction;
	};
}

export interface MsSqlGeneratedColumnConfig {
	mode?: 'virtual' | 'persisted';
}

export abstract class MsSqlColumnBuilder<
	T extends ColumnBuilderBaseConfig<ColumnType> = ColumnBuilderBaseConfig<ColumnType>,
	TRuntimeConfig extends object = object,
	TExtraConfig extends ColumnBuilderExtraConfig = ColumnBuilderExtraConfig,
> extends ColumnBuilder<T, TRuntimeConfig, TExtraConfig> {
	static override readonly [entityKind]: string = 'MsSqlColumnBuilder';

	private foreignKeyConfigs: ReferenceConfig[] = [];

	references(ref: ReferenceConfig['ref'], actions: ReferenceConfig['actions'] = {}): this {
		this.foreignKeyConfigs.push({ ref, actions });
		return this;
	}

	unique(name?: string): this {
		this.config.isUnique = true;
		this.config.uniqueName = name;
		return this;
	}

	generatedAlwaysAs(
		as: SQL | T['data'] | (() => SQL),
		config?: MsSqlGeneratedColumnConfig,
	): HasGenerated<this, {
		type: 'always';
	}> {
		this.config.generated = {
			as,
			type: 'always',
			mode: config?.mode ?? 'virtual',
		};
		return this as any;
	}

	/** @internal */
	buildForeignKeys(column: MsSqlColumn, table: MsSqlTable): ForeignKey[] {
		return this.foreignKeyConfigs.map(({ ref, actions }) => {
			return ((ref, actions) => {
				const builder = new ForeignKeyBuilder(() => {
					const foreignColumn = ref();
					return { columns: [column], foreignColumns: [foreignColumn] };
				});
				if (actions.onUpdate) {
					builder.onUpdate(actions.onUpdate);
				}
				if (actions.onDelete) {
					builder.onDelete(actions.onDelete);
				}
				return builder.build(table);
			})(ref, actions);
		});
	}

	/** @internal */
	abstract build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlColumn<any>;
}

// To understand how to use `MsSqlColumn` and `AnyMsSqlColumn`, see `Column` and `AnyColumn` documentation.
export abstract class MsSqlColumn<
	T extends ColumnBaseConfig<ColumnType> = ColumnBaseConfig<ColumnType>,
	TRuntimeConfig extends object = object,
> extends Column<T, TRuntimeConfig> {
	static override readonly [entityKind]: string = 'MsSqlColumn';

	/** @internal */
	override readonly table: MsSqlTable;

	constructor(
		table: MsSqlTable,
		config: ColumnBuilderRuntimeConfig<T['data']> & TRuntimeConfig,
	) {
		super(table, config);
		this.table = table;
	}

	/** @internal */
	override shouldDisableInsert(): boolean {
		return false;
	}
}

export type AnyMsSqlColumn<TPartial extends Partial<ColumnBaseConfig<ColumnType>> = {}> = MsSqlColumn<
	Required<Update<ColumnBaseConfig<ColumnType>, TPartial>>
>;

export interface MsSqlColumnWithIdentityConfig {
	identity: { seed?: number; increment?: number } | undefined;
}

export abstract class MsSqlColumnBuilderWithIdentity<
	T extends ColumnBuilderBaseConfig<ColumnType> = ColumnBuilderBaseConfig<
		ColumnType
	>,
	TRuntimeConfig extends object = object,
	TExtraConfig extends ColumnBuilderExtraConfig = ColumnBuilderExtraConfig,
> extends MsSqlColumnBuilder<T, TRuntimeConfig & MsSqlColumnWithIdentityConfig, TExtraConfig> {
	static override readonly [entityKind]: string = 'MsSqlColumnBuilderWithAutoIncrement';

	constructor(name: string, dataType: T['dataType'], columnType: string) {
		super(name, dataType, columnType);
	}

	identity(): NotNull<HasGenerated<this>>;
	identity(config: { seed: number; increment: number }): NotNull<HasGenerated<this>>;
	identity(config?: { seed: number; increment: number }): NotNull<HasGenerated<this>> {
		this.config.identity = {
			seed: config ? config.seed : 1,
			increment: config ? config.increment : 1,
		};
		this.config.hasDefault = true;
		this.config.notNull = true;
		return this as NotNull<HasGenerated<this>>;
	}
}

export abstract class MsSqlColumnWithIdentity<
	T extends ColumnBaseConfig<ColumnType> = ColumnBaseConfig<ColumnType>,
	TRuntimeConfig extends object = object,
> extends MsSqlColumn<T, MsSqlColumnWithIdentityConfig & TRuntimeConfig> {
	static override readonly [entityKind]: string = 'MsSqlColumnWithAutoIncrement';

	readonly identity = this.config.identity;

	override shouldDisableInsert(): boolean {
		return !!this.identity;
	}
}
