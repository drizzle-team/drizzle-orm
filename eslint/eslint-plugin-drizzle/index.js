// @ts-nocheck
const { ESLintUtils } = require('@typescript-eslint/experimental-utils');
const ts = require('typescript');

module.exports = {
	rules: {
		'require-entity-kind': ESLintUtils.RuleCreator((name) => name)({
			meta: {
				type: 'problem',
				docs: {
					description: 'Enforce the usage of a static readonly [entityKind] property on Drizzle classes',
					recommended: 'error',
				},
				messages: {
					missingEntityKind:
						"Class '{{name}}' doesn't have a static readonly [entityKind] property defined with a string value.",
				},
				schema: [],
				fixable: 'code',
			},
			defaultOptions: [],
			create(context) {
				const parserServices = ESLintUtils.getParserServices(context);
				const checker = parserServices.program.getTypeChecker();

				return {
					ClassDeclaration(node) {
						const tsNode = parserServices.esTreeNodeToTSNodeMap.get(node);
						const className = tsNode.name
							? tsNode.name.text
							: undefined;

						ts.SyntaxKind.PropertyDeclaration;

						for (const prop of tsNode.members) {
							if (
								prop.kind
									=== ts.SyntaxKind.PropertyDeclaration
								&& prop.modifiers?.some(
									(m) => m.kind === ts.SyntaxKind.StaticKeyword,
								)
								&& prop.modifiers?.some(
									(m) =>
										m.kind
											=== ts.SyntaxKind.ReadonlyKeyword,
								)
								&& ts.isComputedPropertyName(prop.name)
								&& ts.isIdentifier(prop.name.expression)
								&& prop.name.expression.escapedText
									=== 'entityKind'
								&& checker
									.getTypeAtLocation(prop.initializer)
									.isStringLiteral()
							) {
								return;
							}
						}

						context.report({
							node,
							messageId: 'missingEntityKind',
							data: {
								name: className,
							},
							fix(fixer) {
								const classBodyOpeningCurlyToken = context
									.getSourceCode()
									.getFirstToken(node.body);
								const insertionPoint = classBodyOpeningCurlyToken.range[1];
								return fixer.insertTextAfterRange(
									[insertionPoint, insertionPoint],
									`\n\tstatic readonly [entityKind]: string = '${className}';\n`,
								);
							},
						});
					},
				};
			},
		}),
	},
};
