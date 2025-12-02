import { makeRecipe } from 'ohm-js';

const result = {};
result.PGArrayExpression = makeRecipe([
	'grammar',
	{
		source:
			'PGArrayExpression {    \n    Array = "ARRAY[" ListOf<ArrayItem, ","> "]"\n\n    ArrayItem = stringLiteral | Array | quotelessString  | nullLiteral\n\n    stringLiteral = "\\"" ((~("\\"" | escapedSymbol) any) | escapedSymbol)* "\\""\n    \n    quotelessString = (~forbiddenSymbolForQuoteless any)+\n\n\tescapedSymbol = "\\\\" any\n\n    nullLiteral = "NULL"\n\n\tforbiddenSymbolForQuoteless = "[" | "]" | " , " | "\\""  | nullLiteral\n}',
	},
	'PGArrayExpression',
	null,
	'Array',
	{
		Array: [
			'define',
			{ sourceInterval: [28, 71] },
			null,
			[],
			[
				'seq',
				{ sourceInterval: [36, 71] },
				['terminal', { sourceInterval: [36, 44] }, 'ARRAY['],
				[
					'app',
					{ sourceInterval: [45, 67] },
					'ListOf',
					[
						['app', { sourceInterval: [52, 61] }, 'ArrayItem', []],
						['terminal', { sourceInterval: [63, 66] }, ','],
					],
				],
				['terminal', { sourceInterval: [68, 71] }, ']'],
			],
		],
		ArrayItem: [
			'define',
			{ sourceInterval: [77, 143] },
			null,
			[],
			[
				'alt',
				{ sourceInterval: [89, 143] },
				['app', { sourceInterval: [89, 102] }, 'stringLiteral', []],
				['app', { sourceInterval: [105, 110] }, 'Array', []],
				['app', { sourceInterval: [113, 128] }, 'quotelessString', []],
				['app', { sourceInterval: [132, 143] }, 'nullLiteral', []],
			],
		],
		stringLiteral: [
			'define',
			{ sourceInterval: [149, 223] },
			null,
			[],
			[
				'seq',
				{ sourceInterval: [165, 223] },
				['terminal', { sourceInterval: [165, 169] }, '"'],
				[
					'star',
					{ sourceInterval: [170, 218] },
					[
						'alt',
						{ sourceInterval: [171, 216] },
						[
							'seq',
							{ sourceInterval: [171, 200] },
							[
								'not',
								{ sourceInterval: [172, 195] },
								['alt', { sourceInterval: [174, 194] }, ['terminal', { sourceInterval: [174, 178] }, '"'], [
									'app',
									{ sourceInterval: [181, 194] },
									'escapedSymbol',
									[],
								]],
							],
							['app', { sourceInterval: [196, 199] }, 'any', []],
						],
						['app', { sourceInterval: [203, 216] }, 'escapedSymbol', []],
					],
				],
				['terminal', { sourceInterval: [219, 223] }, '"'],
			],
		],
		quotelessString: [
			'define',
			{ sourceInterval: [233, 286] },
			null,
			[],
			[
				'plus',
				{ sourceInterval: [251, 286] },
				[
					'seq',
					{ sourceInterval: [252, 284] },
					['not', { sourceInterval: [252, 280] }, [
						'app',
						{ sourceInterval: [253, 280] },
						'forbiddenSymbolForQuoteless',
						[],
					]],
					['app', { sourceInterval: [281, 284] }, 'any', []],
				],
			],
		],
		escapedSymbol: [
			'define',
			{ sourceInterval: [289, 313] },
			null,
			[],
			['seq', { sourceInterval: [305, 313] }, ['terminal', { sourceInterval: [305, 309] }, '\\'], [
				'app',
				{ sourceInterval: [310, 313] },
				'any',
				[],
			]],
		],
		nullLiteral: ['define', { sourceInterval: [319, 339] }, null, [], [
			'terminal',
			{ sourceInterval: [333, 339] },
			'NULL',
		]],
		forbiddenSymbolForQuoteless: [
			'define',
			{ sourceInterval: [342, 411] },
			null,
			[],
			[
				'alt',
				{ sourceInterval: [372, 411] },
				['terminal', { sourceInterval: [372, 375] }, '['],
				['terminal', { sourceInterval: [378, 381] }, ']'],
				['terminal', { sourceInterval: [384, 389] }, ' , '],
				['terminal', { sourceInterval: [392, 396] }, '"'],
				['app', { sourceInterval: [400, 411] }, 'nullLiteral', []],
			],
		],
	},
]);
result.PGArrayLiteral = makeRecipe([
	'grammar',
	{
		source:
			'PGArrayLiteral {    \n    Array = "{" ListOf<ArrayItem, ","> "}"\n\n    ArrayItem = stringLiteral | quotelessString | nullLiteral | Array\n\n    stringLiteral = "\\"" ((~("\\"" | escapedSymbol) any) | escapedSymbol)* "\\""\n    \n    quotelessString = (~forbiddenSymbolForQuoteless any)+\n\n\tescapedSymbol = "\\\\" any \n\n    nullLiteral = "NULL"\n\n\tforbiddenSymbolForQuoteless = "{" | "}" | "," | "\\""  | nullLiteral\n}',
	},
	'PGArrayLiteral',
	null,
	'Array',
	{
		Array: [
			'define',
			{ sourceInterval: [25, 63] },
			null,
			[],
			[
				'seq',
				{ sourceInterval: [33, 63] },
				['terminal', { sourceInterval: [33, 36] }, '{'],
				[
					'app',
					{ sourceInterval: [37, 59] },
					'ListOf',
					[
						['app', { sourceInterval: [44, 53] }, 'ArrayItem', []],
						['terminal', { sourceInterval: [55, 58] }, ','],
					],
				],
				['terminal', { sourceInterval: [60, 63] }, '}'],
			],
		],
		ArrayItem: [
			'define',
			{ sourceInterval: [69, 134] },
			null,
			[],
			[
				'alt',
				{ sourceInterval: [81, 134] },
				['app', { sourceInterval: [81, 94] }, 'stringLiteral', []],
				['app', { sourceInterval: [97, 112] }, 'quotelessString', []],
				['app', { sourceInterval: [115, 126] }, 'nullLiteral', []],
				['app', { sourceInterval: [129, 134] }, 'Array', []],
			],
		],
		stringLiteral: [
			'define',
			{ sourceInterval: [140, 214] },
			null,
			[],
			[
				'seq',
				{ sourceInterval: [156, 214] },
				['terminal', { sourceInterval: [156, 160] }, '"'],
				[
					'star',
					{ sourceInterval: [161, 209] },
					[
						'alt',
						{ sourceInterval: [162, 207] },
						[
							'seq',
							{ sourceInterval: [162, 191] },
							[
								'not',
								{ sourceInterval: [163, 186] },
								['alt', { sourceInterval: [165, 185] }, ['terminal', { sourceInterval: [165, 169] }, '"'], [
									'app',
									{ sourceInterval: [172, 185] },
									'escapedSymbol',
									[],
								]],
							],
							['app', { sourceInterval: [187, 190] }, 'any', []],
						],
						['app', { sourceInterval: [194, 207] }, 'escapedSymbol', []],
					],
				],
				['terminal', { sourceInterval: [210, 214] }, '"'],
			],
		],
		quotelessString: [
			'define',
			{ sourceInterval: [224, 277] },
			null,
			[],
			[
				'plus',
				{ sourceInterval: [242, 277] },
				[
					'seq',
					{ sourceInterval: [243, 275] },
					['not', { sourceInterval: [243, 271] }, [
						'app',
						{ sourceInterval: [244, 271] },
						'forbiddenSymbolForQuoteless',
						[],
					]],
					['app', { sourceInterval: [272, 275] }, 'any', []],
				],
			],
		],
		escapedSymbol: [
			'define',
			{ sourceInterval: [280, 304] },
			null,
			[],
			['seq', { sourceInterval: [296, 304] }, ['terminal', { sourceInterval: [296, 300] }, '\\'], [
				'app',
				{ sourceInterval: [301, 304] },
				'any',
				[],
			]],
		],
		nullLiteral: ['define', { sourceInterval: [311, 331] }, null, [], [
			'terminal',
			{ sourceInterval: [325, 331] },
			'NULL',
		]],
		forbiddenSymbolForQuoteless: [
			'define',
			{ sourceInterval: [334, 401] },
			null,
			[],
			[
				'alt',
				{ sourceInterval: [364, 401] },
				['terminal', { sourceInterval: [364, 367] }, '{'],
				['terminal', { sourceInterval: [370, 373] }, '}'],
				['terminal', { sourceInterval: [376, 379] }, ','],
				['terminal', { sourceInterval: [382, 386] }, '"'],
				['app', { sourceInterval: [390, 401] }, 'nullLiteral', []],
			],
		],
	},
]);
export default result;
