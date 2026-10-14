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
		'prefer-new-array': defineRule({
			meta: {
				messages: {
					preferNewArray: 'Prefer `new Array(length)` over `Array.from({ length })`',
				},
				fixable: 'code',
			},
			create: (context) => ({
				CallExpression: (node) => {
					const { callee, arguments: args } = node;
					if (
						callee.type !== 'MemberExpression' || callee.computed
						|| callee.object.type !== 'Identifier' || callee.object.name !== 'Array'
						|| callee.property.type !== 'Identifier' || callee.property.name !== 'from'
					) return;

					if (args.length === 0 || args[0].type !== 'ObjectExpression' || args[0].properties.length !== 1) return;

					const prop = args[0].properties[0];
					if (prop.type !== 'Property' || prop.kind !== 'init' || prop.method || prop.computed) return;
					if (
						!(prop.key.type === 'Identifier' && prop.key.name === 'length')
						&& !(prop.key.type === 'Literal' && prop.key.value === 'length')
					) return;

					// `Array.from({ length }, mapFn)` has no drop-in `new Array(length)` equivalent - fill it with a loop
					const mapped = args.length > 1;
					// `new Array(length)` is holey: only `.fill()` / `.join()` chains behave identically
					const parent = node.parent;
					const chained = parent?.type === 'MemberExpression' && parent.object === node;
					const safeChain = chained && !parent.computed
						&& (parent.property.name === 'fill' || parent.property.name === 'join');

					const lengthText = context.sourceCode.getText(prop.value);
					const typeArgs = node.typeArguments ?? node.typeParameters;
					const typeArgsText = typeArgs ? context.sourceCode.getText(typeArgs) : '';
					context.report({
						node: node,
						message: 'Prefer `new Array(length)` over `Array.from({ length })`',
						fix: mapped || (chained && !safeChain) ? undefined : (fixer) =>
							fixer.replaceText(
								node,
								`new Array${typeArgsText}(${
									prop.value.type === 'SequenceExpression' ? `(${lengthText})` : lengthText
								})`,
							),
					});
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
