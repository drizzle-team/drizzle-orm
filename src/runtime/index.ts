// Ajuste na lógica de renderização de colunas para utilizar o método toSQL()
// Este é um exemplo simplificado de onde a integração ocorre no motor de renderização do Drizzle

export function renderColumn(column: Column) {
  // Em vez de usar column.name diretamente, usamos o toSQL()
  // que agora suporta o wrap customizado.
  return column.toSQL();
}
