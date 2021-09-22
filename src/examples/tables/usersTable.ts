/* eslint-disable max-classes-per-file */
import AbstractTable from '../../tables/abstractTable';
import RolesType from '../types/rolesType';

export default class UsersTable extends AbstractTable<UsersTable> {
  public id = this.int('id').autoIncrement().primaryKey();
  public phone = this.varchar('phone', { size: 256 });
  // public fullName = this.varchar('full_name', { size: 512 });
  // public test = this.decimal('test', { notNull: true, precision: 100, scale: 2 });
  // public test1 = this.bigint('test1');
  public createdAt = this.timestamp('created_at', { notNull: true });
  public updatedAt = this.timestamp('updated_at');

  public role = this.type<RolesType>('name_in_table', { notNull: true });

  // public phoneFullNameIndex = this.index([this.phone, this.fullName]);
  // public phoneIndex = this.index(this.phone);

  public tableName(): string {
    return 'users';
  }
}
