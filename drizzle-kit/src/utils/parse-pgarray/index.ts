import PGArray from './grammar/grammar.ohm-bundle';

const semantics = PGArray.createSemantics();

semantics.addOperation('parseArray', {
	Array(lBracket, argList, rBracket) {
		return argList['parseArray']();
	},

	ArrayItem(arg0) {
		return arg0['parseArray']();
	},

	NonemptyListOf(arg0, arg1, arg2) {
		return [arg0['parseArray'](), ...arg1['parseArray'](), ...arg2['parseArray']()];
	},

	EmptyListOf() {
		return [];
	},

	_iter(...children) {
		return children.map((c) => c['parseArray']()).filter((e) => e !== undefined);
	},

	_terminal() {
		return undefined;
	},

	stringLiteral(lQuote, string, rQuote) {
		return JSON.parse('"' + string.sourceString.replaceAll("''", "'") + '"');
	},

	quotelessString(string) {
		return string.sourceString.replaceAll("''", "'");
	},

	nullLiteral(_) {
		return null;
	},
});

export type ArrayValue = string | null | ArrayValue[];

export function parseArray(array: string) {
	const match = PGArray.match(array, 'Array');

	if (match.failed()) throw new Error(`Failed to parse array: '${array}'`);

	const res = semantics(match)['parseArray']();
	return res as ArrayValue[];
}
