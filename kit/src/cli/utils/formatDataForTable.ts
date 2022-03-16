import { Named, RenamedObject } from '../components-api';

const transpose = <T>(matrix: T[][]) => {
  let [row] = matrix
  return row.map((value, column) => matrix.map(row => row[column]))
}

export default <T extends Named>(
  created: Named[],
  renamed: RenamedObject<T>[],
  deleted: Named[],
): string[][] => {
  const columns: string[][] = [[],[],[]];

  columns[0] = created.map(({name}) => name);
  columns[1] = renamed.map(({from, to}) => `${from.name} -> ${to.name}`);
  columns[2] = deleted.map(({name}) => name);

  const maxColumnLength = Math.max(columns[0].length, columns[1].length, columns[2].length)

  const filledColumns = columns.map((column) => {
    const columnLength = column.length;
    column.length = maxColumnLength;
    column.fill('', columnLength)
    return column;
  })

  return transpose(filledColumns);
};
