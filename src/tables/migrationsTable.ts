import AbstractTable from './abstractTable';

export default class MigrationsTable extends AbstractTable<MigrationsTable> {
  public id = this.int('id').autoIncrement().primaryKey();
  public hash = this.text('hash', { notNull: true });
  public createdAt = this.bigint('created_at');

  public tableName(): string {
    return 'drizzle_migrations';
  }
}
