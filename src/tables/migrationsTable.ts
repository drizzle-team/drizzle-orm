import AbstractTable from './abstractTable';

export default class MigrationsTable extends AbstractTable<MigrationsTable> {
  public id = this.int('id').autoIncrement().primaryKey();
  public version = this.int('version', { notNull: true }).unique();
  public hash = this.text('hash');
  public createdAt = this.timestamp('created_at');

  public tableName(): string {
    return 'migrations';
  }
}
