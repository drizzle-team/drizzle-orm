// @ts-nocheck
import { definePlugin, defineRule } from 'oxlint';

export default definePlugin({
	meta: { name: 'drizzle-internal' },
	rules: {
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
		'require-has-instance': defineRule({
			meta: {
				messages: {
					missingHasInstance: "Class '{{name}}' doesn't have a static [Symbol.hasInstance] method defined.",
				},
				fixable: 'code',
				schema: [{
					type: 'object',
					properties: { subclasses: { type: 'boolean' } },
					additionalProperties: false,
				}],
			},
			create: (context) => {
				// Statics are inherited, so by default only classes that introduce `[entityKind]` (no `override`)
				// have to define the method. `subclasses: true` demands it on every entity class.
				const subclasses = context.options[0]?.subclasses === true;

				const isStaticComputed = (member) =>
					(member.type === 'PropertyDefinition' || member.type === 'MethodDefinition')
					&& member.static && member.computed;

				const check = (node) => {
					let entityKind;
					let hasInstance = false;
					for (const member of node.body.body) {
						if (!isStaticComputed(member)) continue;

						const { key } = member;
						if (key.type === 'Identifier' && key.name === 'entityKind') {
							entityKind = member;
						} else if (
							key.type === 'MemberExpression' && !key.computed
							&& key.object.type === 'Identifier' && key.object.name === 'Symbol'
							&& key.property.type === 'Identifier' && key.property.name === 'hasInstance'
						) {
							hasInstance = true;
						}
					}

					// Classes without `[entityKind]` are `require-entity-kind`'s business
					if (hasInstance || !entityKind || (entityKind.override && !subclasses)) return;

					const indent = ' '.repeat(entityKind.loc.start.column);
					const line = context.sourceCode.lines[entityKind.loc.start.line - 1];
					const pad = line.slice(0, entityKind.loc.start.column).trim() === ''
						? line.slice(0, entityKind.loc.start.column)
						: indent;
					// A class with a superclass already inherits `Function.prototype[Symbol.hasInstance]` at the very least
					const modifier = node.superClass ? 'static override' : 'static';

					context.report({
						node: node.id ?? node,
						message: `Class '${
							node.id?.name ?? '<anonymous>'
						}' doesn't have a static [Symbol.hasInstance] method defined.`,
						// `is` still has to be imported from `entity.ts` by hand
						fix: (fixer) =>
							fixer.insertTextAfter(
								entityKind,
								`\n${pad}${modifier} [Symbol.hasInstance](value: unknown): boolean {\n${pad}\treturn is(value, this);\n${pad}}`,
							),
					});
				};

				return { ClassDeclaration: check, ClassExpression: check };
			},
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
