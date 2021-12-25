/* eslint-disable max-classes-per-file */
import AbstractTable from '../../tables/abstractTable';
import { createEnum } from '../../types/type';
// import { rolesEnum } from '../types/rolesType';

export const rolesEnum = createEnum({ alias: 'test-enum', values: ['user', 'guest', 'admin'] });

export default class UsersTable extends AbstractTable<UsersTable> {
  public id = this.serial('id').primaryKey();
  public fullName = this.text('full_name');

  public phone = this.varchar('phone', { size: 256 });
  public media = this.jsonb<string[]>('media');
  public decimalField = this.decimal('test', { notNull: true, precision: 100, scale: 2 });
  public bigIntField = this.bigint('test1');
  // public role = this.type(rolesEnum, 'name_in_table', { notNull: true });

  public createdAt = this.timestamp('created_at', { notNull: true });
  public updatedAt = this.timestamp('updated_at');
  public isArchived = this.bool('is_archived').defaultValue(false);

  public phoneFullNameIndex = this.index([this.phone, this.fullName]);
  public phoneIndex = this.uniqueIndex(this.phone);

  public tableName(): string {
    return 'users';
  }
}
