import AbstractTable from '../../../../src/tables/abstractTable';

export default class UsersTable extends AbstractTable<UsersTable> {
  public id = this.serial('id').primaryKey();

  public fullName = this.text('full_name');
  public fullName1 = this.text('full_name').notNull();
  public fullName2 = this.text('full_name').defaultValue('');
  public fullName3 = this.text('full_name').notNull().defaultValue('');
  public fullName4 = this.text('full_name').unique();
  public fullName5 = this.text('full_name').notNull().unique();

  public tableName(): string {
    return 'users_with_all_texts';
  }
}
