import PGArray from './grammar/grammar.ohm-bundle';

const literalArraySemantics = PGArray.PGArrayLiteral.createSemantics();
literalArraySemantics.addOperation('parseArray', {
	Array(_lBracket, argList, _rBracket) {
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
		return;
	},

	stringLiteral(_lQuote, string, _rQuote) {
		return JSON.parse('"' + string.sourceString.replaceAll("''", "'") + '"');
	},

	quotelessString(string) {
		return string.sourceString.replaceAll("''", "'");
	},

	nullLiteral(_) {
		return null;
	},
});

const expressionArraySemantics = PGArray.PGArrayExpression.createSemantics();
expressionArraySemantics.addOperation('parseExpressionArray', {
	Array(_lBracket, argList, _rBracket) {
		return argList['parseExpressionArray']();
	},

	ArrayItem(arg0) {
		return arg0['parseExpressionArray']();
	},

	NonemptyListOf(arg0, arg1, arg2) {
		return [arg0['parseExpressionArray'](), ...arg1['parseExpressionArray'](), ...arg2['parseExpressionArray']()];
	},

	EmptyListOf() {
		return [];
	},

	_iter(...children) {
		return children.map((c) => c['parseExpressionArray']()).filter((e) => e !== undefined);
	},

	_terminal() {
		return;
	},

	stringLiteral(_lQuote, string, _rQuote) {
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

// '{}'
// every value will be a string
export function parseArray(array: string) {
	const match = PGArray.PGArrayLiteral.match(array, 'Array');

	if (match.failed()) throw new Error(`Failed to parse array: '${array}'`);

	const res = literalArraySemantics(match)['parseArray']();
	return res as ArrayValue[];
}

// ARRAY[]
// every value will be a string
export function parseExpressionArray(array: string) {
	const match = PGArray.PGArrayExpression.match(array, 'Array');

	if (match.failed()) throw new Error(`Failed to parse array: '${array}'`);

	const res = expressionArraySemantics(match)['parseExpressionArray']();
	return res as ArrayValue[];
}
