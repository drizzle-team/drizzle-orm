import { AbstractTable, ExtractModel } from '@/tables';
import { defaultNotNullVarchar, defaultVarchar } from './allVarcharsTable';

export default class AllVarcharsFixedLengthTable extends AbstractTable<
AllVarcharsFixedLengthTable
> {
  public primaryVarcharLength = this.varchar('primary_key', { size: 20 }).primaryKey();
  public simpleVarcharLength = this.varchar('simple_varchar_length', { size: 20 });
  public notNullVarcharLength = this.varchar('not_null_varchar_length', { size: 20 }).notNull();
  public varcharWithDefaultLength = this.varchar('varchar_with_default_length', { size: 20 }).defaultValue(defaultVarchar);
  public notNullVarcharWithDefaultLength = this.varchar('not_null_varchar_with_default_length', { size: 20 }).notNull().defaultValue(defaultNotNullVarchar);
  public uniqueVarcharLength = this.varchar('unique_varchar_length', { size: 20 }).unique();
  public notNullUniqueVarcharLength = this.varchar('not_null_unique_varchar_length', { size: 20 }).notNull().unique();

  public primaryVarcharLengthIndex = this.index(this.primaryVarcharLength);

  public tableName(): string {
    return 'table_with_all_varchars_fixed_length';
  }
}

export type AllVarcharsFixedLengthModel = ExtractModel<AllVarcharsFixedLengthTable>;
