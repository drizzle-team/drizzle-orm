import { SQL, sql } from './sql-template';

export type ColumnConfig = {
  name?: string;
  customType?: any;
  // Adicionando a capacidade de envolver a coluna em SQL customizado
  wrap?: (column: SQL) => SQL;
};

export class Column {
  constructor(
    public readonly name: string,
    public readonly config: ColumnConfig,
    public readonly type: any
  ) {}

  // Método para obter a representação SQL da coluna, aplicando o wrap se existir
  toSQL(): SQL {
    const columnSql = sql.identifier(this.name);
    if (this.config.wrap) {
      return this.config.wrap(columnSql);
    }
    return columnSql;
  }
}
