import { ExtractModel } from '@/tables';
import AbstractTable from '../../../../src/tables/abstractTable';

export default class AllVarcharsTable extends AbstractTable<AllVarcharsTable> {
  public primaryVarchar = this.varchar('primary_key').primaryKey();

  public simpleVarchar = this.varchar('simple_varchar');
  public notNullVarchar = this.varchar('not_null_varchar').notNull();
  public varcharWithDefault = this.varchar('varchar_with_default').defaultValue('UA');
  public notNullVarcharWithDefault = this.varchar('not_null_varchar_with_default').notNull().defaultValue('not_null_default');
  public uniqueVarchar = this.varchar('unique_varchar').unique();
  public notNullUniqueVarchar = this.varchar('not_null_unique_varchar').notNull().unique();

  public primaryVarcharIndex = this.index(this.primaryVarchar);

  public tableName(): string {
    return 'table_with_all_varchars';
  }
}

export type AllVarcharsTableModel = ExtractModel<AllVarcharsTable>;
