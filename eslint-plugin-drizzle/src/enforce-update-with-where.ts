import { ESLintUtils } from '@typescript-eslint/utils';
import type { TSESTree } from '@typescript-eslint/utils';
import { resolveMemberExpressionPath } from './utils/ast';
import { isDrizzleObj, type Options } from './utils/options';

const createRule = ESLintUtils.RuleCreator(() => 'https://github.com/drizzle-team/eslint-plugin-drizzle');
type MessageIds = 'enforceUpdateWithWhere';

function chainHasWhere(node: TSESTree.MemberExpression): boolean {
	// Walk up ancestors to find a .where() chained after .set()
	// e.g. .update().set().from().where()
	let parent: TSESTree.Node | undefined = node.parent;
	while (parent) {
		if (parent.type === 'CallExpression') {
			const grandparent = parent.parent;
			if (grandparent?.type === 'MemberExpression') {
				const gp = grandparent as TSESTree.MemberExpression;
				if (gp.property.type === 'Identifier' && gp.property.name === 'where') {
					return true;
				}
			}
		}
		parent = parent.parent;
	}

	// Walk down object chain to find a .where() chained before .set()
	// e.g. .update().where().set()
	let object: TSESTree.Expression = node.object;
	while (object.type === 'CallExpression') {
		if (object.callee.type === 'MemberExpression') {
			const callee = object.callee;
			if (callee.property.type === 'Identifier' && callee.property.name === 'where') {
				return true;
			}
			object = callee.object;
		} else {
			break;
		}
	}

	return false;
}

const updateRule = createRule<Options, MessageIds>({
	defaultOptions: [{ drizzleObjectName: [] }],
	name: 'enforce-update-with-where',
	meta: {
		type: 'problem',
		docs: {
			description: 'Enforce that `update` method is used with `where` to avoid deleting all the rows in a table.',
		},
		fixable: 'code',
		messages: {
			enforceUpdateWithWhere:
				"Without `.where(...)` you will update all the rows in a table. If you didn't want to do it, please use `{{ drizzleObjName }}.update(...).set(...).where(...)` instead. Otherwise you can ignore this rule here",
		},
		schema: [{
			type: 'object',
			properties: {
				drizzleObjectName: {
					type: ['string', 'array'],
				},
			},
			additionalProperties: false,
		}],
	},
	create(context, options) {
		return {
			MemberExpression: (node) => {
				if (node.property.type === 'Identifier') {
					if (
						node.property.name === 'set'
						&& node.object.type === 'CallExpression'
						&& node.object.callee.type === 'MemberExpression'
						&& node.object.callee.property.type === 'Identifier'
						&& node.object.callee.property.name === 'update'
						&& isDrizzleObj(node.object.callee, options)
						&& !chainHasWhere(node)
					) {
						context.report({
							node,
							messageId: 'enforceUpdateWithWhere',
							data: {
								drizzleObjName: resolveMemberExpressionPath(node.object.callee),
							},
						});
					}
				}
				return;
			},
		};
	},
});

export default updateRule;
