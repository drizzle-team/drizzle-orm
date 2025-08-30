import { makeRecipe } from 'ohm-js';
const result = makeRecipe([
	'grammar',
	{
		source:
			'PGArray {    \n    Array = "{" ListOf<ArrayItem, ","> "}"\n\n    ArrayItem = stringLiteral | quotelessString | nullLiteral | Array\n\n    stringLiteral = "\\"" ((~("\\"" | escapedSymbol) any) | escapedSymbol)* "\\""\n    \n    quotelessString = (~forbiddenSymbolForQuoteless any)+\n\n\tescapedSymbol = "\\\\" any \n\n    nullLiteral = "NULL"\n\n\tforbiddenSymbolForQuoteless = "{" | "}" | "," | "\\""  | nullLiteral\n}',
	},
	'PGArray',
	null,
	'Array',
	{
		Array: ['define', { sourceInterval: [18, 56] }, null, [], ['seq', { sourceInterval: [26, 56] }, ['terminal', {
			sourceInterval: [26, 29],
		}, '{'], ['app', { sourceInterval: [30, 52] }, 'ListOf', [['app', { sourceInterval: [37, 46] }, 'ArrayItem', []], [
			'terminal',
			{ sourceInterval: [48, 51] },
			',',
		]]], ['terminal', { sourceInterval: [53, 56] }, '}']]],
		ArrayItem: ['define', { sourceInterval: [62, 127] }, null, [], [
			'alt',
			{ sourceInterval: [74, 127] },
			['app', { sourceInterval: [74, 87] }, 'stringLiteral', []],
			['app', { sourceInterval: [90, 105] }, 'quotelessString', []],
			['app', { sourceInterval: [108, 119] }, 'nullLiteral', []],
			['app', { sourceInterval: [122, 127] }, 'Array', []],
		]],
		stringLiteral: ['define', { sourceInterval: [133, 207] }, null, [], ['seq', { sourceInterval: [149, 207] }, [
			'terminal',
			{ sourceInterval: [149, 153] },
			'"',
		], ['star', { sourceInterval: [154, 202] }, ['alt', { sourceInterval: [155, 200] }, ['seq', {
			sourceInterval: [155, 184],
		}, ['not', { sourceInterval: [156, 179] }, ['alt', { sourceInterval: [158, 178] }, ['terminal', {
			sourceInterval: [158, 162],
		}, '"'], ['app', { sourceInterval: [165, 178] }, 'escapedSymbol', []]]], [
			'app',
			{ sourceInterval: [180, 183] },
			'any',
			[],
		]], ['app', { sourceInterval: [187, 200] }, 'escapedSymbol', []]]], [
			'terminal',
			{ sourceInterval: [203, 207] },
			'"',
		]]],
		quotelessString: ['define', { sourceInterval: [217, 270] }, null, [], ['plus', { sourceInterval: [235, 270] }, [
			'seq',
			{ sourceInterval: [236, 268] },
			['not', { sourceInterval: [236, 264] }, [
				'app',
				{ sourceInterval: [237, 264] },
				'forbiddenSymbolForQuoteless',
				[],
			]],
			['app', { sourceInterval: [265, 268] }, 'any', []],
		]]],
		escapedSymbol: ['define', { sourceInterval: [273, 297] }, null, [], ['seq', { sourceInterval: [289, 297] }, [
			'terminal',
			{ sourceInterval: [289, 293] },
			'\\',
		], ['app', { sourceInterval: [294, 297] }, 'any', []]]],
		nullLiteral: ['define', { sourceInterval: [304, 324] }, null, [], [
			'terminal',
			{ sourceInterval: [318, 324] },
			'NULL',
		]],
		forbiddenSymbolForQuoteless: ['define', { sourceInterval: [327, 394] }, null, [], [
			'alt',
			{ sourceInterval: [357, 394] },
			['terminal', { sourceInterval: [357, 360] }, '{'],
			['terminal', { sourceInterval: [363, 366] }, '}'],
			['terminal', { sourceInterval: [369, 372] }, ','],
			['terminal', { sourceInterval: [375, 379] }, '"'],
			['app', { sourceInterval: [383, 394] }, 'nullLiteral', []],
		]],
	},
]);
export default result;
