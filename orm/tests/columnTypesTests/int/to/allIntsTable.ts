import AbstractTable from '../../../../src/tables/abstractTable';

export default class AllIntsTable extends AbstractTable<AllIntsTable> {
  public primaryInt = this.int('primary_key').primaryKey();
  public serialInt = this.serial('serial_int');

  public simpleInt = this.int('simple_int');
  public notNullInt = this.int('not_null_int').notNull();
  public intWithDefault = this.int('int_with_default').defaultValue(1);
  public notNullIntWithDefault = this.int('not_null_int_with_default').notNull().defaultValue(1);
  public uniqueInt = this.int('unique_int').unique();
  public notNullUniqueInt = this.int('not_null_unique_int').notNull().unique();

  public tableName(): string {
    return 'table_with_all_ints';
  }
}
