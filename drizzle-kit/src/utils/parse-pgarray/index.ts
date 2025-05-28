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

	stringLiteral_DoubleQuotes(lQuote, string, rQuote) {
		return JSON.parse('"' + string.sourceString + '"');
	},

	stringLiteral_SingleQuotes(lQuote, string, rQuote) {
		// TBD - handle escaped quotes
		return JSON.parse('"' + string.sourceString + '"');
	},

	quotelessString(string) {
		return string.sourceString;
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
