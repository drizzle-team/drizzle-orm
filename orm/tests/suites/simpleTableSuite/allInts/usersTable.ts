import AbstractTable from '../../../../src/tables/abstractTable';

export default class UsersTable extends AbstractTable<UsersTable> {
  public id = this.serial('id').primaryKey();

  public fullName = this.int('full_name');
  public fullName1 = this.int('full_name').notNull();
  public fullName2 = this.int('full_name').defaultValue(1);
  public fullName3 = this.int('full_name').notNull().defaultValue(1);
  public fullName4 = this.int('full_name').unique();
  public fullName5 = this.int('full_name').notNull().unique();

  public tableName(): string {
    return 'users_with_all_texts';
  }
}
