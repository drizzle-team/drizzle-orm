import { type AnyPgColumn } from './columns';
import { type ColumnsWithTable } from './utils';

export interface RelationConfig<
	TTableName extends string,
	TForeignTableName extends string,
	TColumns extends AnyPgColumn<{ tableName: TTableName }>[],
> {
	relationName?: string;
	fields: TColumns;
	references: ColumnsWithTable<TTableName, TForeignTableName, TColumns>;
}
