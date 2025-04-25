import { Simplify } from '../../utils';
import { ForeignKey, Index, TableFull } from './ddl';

export interface CreateTable {
	type: 'create_table';
	table: TableFull;
}
export interface CreateIndex {
	type: 'create_index';
	index: Index;
}

export interface CreateFK {
	type: 'create_fk';
	fk: ForeignKey;
}

export type JsonStatement = CreateTable | CreateIndex | CreateFK;

export const prepareStatement = <
	TType extends JsonStatement['type'],
	TStatement extends Extract<JsonStatement, { type: TType }>,
>(
	type: TType,
	args: Omit<TStatement, 'type'>,
): Simplify<TStatement> => {
	return {
		type,
		...args,
	} as TStatement;
};
