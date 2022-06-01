import AbstractTable from '../../../../src/tables/abstractTable';

export const defaultInt = 1;
export const notNullWithDefault = 1;

export default class AllIntsTable extends AbstractTable<AllIntsTable> {
  public primaryInt = this.int('primary_key').primaryKey();
  public serialInt = this.serial('serial_int');

  public simpleInt = this.int('simple_int');
  public notNullInt = this.int('not_null_int').notNull();
  public intWithDefault = this.int('int_with_default').defaultValue(defaultInt);
  public notNullIntWithDefault = this.int('not_null_int_with_default').notNull().defaultValue(notNullWithDefault);
  public uniqueInt = this.int('unique_int').unique();
  public notNullUniqueInt = this.int('not_null_unique_int').notNull().unique();

  public simpleIntIndex = this.uniqueIndex(this.simpleInt);
  public intWithDefaultIndex = this.index(this.intWithDefault);

  public tableName(): string {
    return 'table_with_all_ints';
  }
}
