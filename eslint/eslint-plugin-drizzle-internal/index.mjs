// @ts-nocheck
import { definePlugin, defineRule } from 'oxlint';

export default definePlugin({
	meta: { name: 'drizzle-internal' },
	rules: {
		'no-instanceof': defineRule({
			meta: {
				messages: {
					noInstanceof: 'Use of "instanceof" operator is forbidden',
				},
				fixable: 'code',
			},
			create: (context) => ({
				BinaryExpression: (node) => {
					if (node.type === 'BinaryExpression' && node.operator === 'instanceof') {
						context.report({
							node: node,
							message: 'Use of "instanceof" operator is forbidden',
						});
					}
				},
			}),
		}),
		'require-entity-kind': defineRule({
			meta: {
				messages: {
					missingEntityKind:
						"Class '{{name}}' doesn't have a static readonly [entityKind] property defined with a string value.",
				},
				fixable: 'code',
			},
			create: (context) => ({
				ClassDeclaration: (node) => {
					const sourceCode = context.sourceCode.getText(node);

					if (
						!(sourceCode.includes('static override readonly [entityKind]: string')
							|| sourceCode.includes('static readonly [entityKind]: string'))
					) {
						context.report({
							node: node,
							message:
								`Class '${node.id.name}' doesn't have a static readonly [entityKind] property defined with a string value.`,
						});
					}
				},
			}),
		}),
	},
});
