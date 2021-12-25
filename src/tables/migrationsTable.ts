import AbstractTable from './abstractTable';

export default class MigrationsTable extends AbstractTable<MigrationsTable> {
  public id = this.serial('id').primaryKey();
  public version = this.int('version').unique().notNull();
  public hash = this.text('hash');
  public createdAt = this.timestamp('created_at');

  public tableName(): string {
    return 'migrations';
  }
}
