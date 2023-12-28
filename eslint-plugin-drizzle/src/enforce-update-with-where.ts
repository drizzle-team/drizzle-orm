import { ESLintUtils } from '@typescript-eslint/utils';
import { resolveMemberExpressionPath } from './utils/ast';
import { isDrizzleObj, type Options } from './utils/options';

const createRule = ESLintUtils.RuleCreator(() => 'https://github.com/drizzle-team/eslint-plugin-drizzle');
type MessageIds = 'enforceUpdateWithWhere';

let lastNodeName: string = '';

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
						lastNodeName !== 'where'
						&& node.property.name === 'set'
						&& node.object.type === 'CallExpression'
						&& node.object.callee.type === 'MemberExpression'
						&& node.object.callee.property.type === 'Identifier'
						&& node.object.callee.property.name === 'update'
						&& isDrizzleObj(node.object.callee, options)
					) {
						context.report({
							node,
							messageId: 'enforceUpdateWithWhere',
							data: {
								drizzleObjName: resolveMemberExpressionPath(node.object.callee),
							},
						});
					}
					lastNodeName = node.property.name;
				}
				return;
			},
		};
	},
});

export default updateRule;
