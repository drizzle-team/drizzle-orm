import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';
import type { Options } from './utils/options';

const createRule = ESLintUtils.RuleCreator(
  () => 'https://github.com/drizzle-team/eslint-plugin-drizzle'
);
type MessageIds = 'enforcePrepareHasUniqueName';

interface QueryLocation {
  preparedName: string;
  node: TSESTree.CallExpression;
  filePath: string;
  line: number;
}

const updateRule = createRule<Options, MessageIds>({
  defaultOptions: [{ drizzleObjectName: [] }],
  name: 'enforce-prepare-has-unique-name',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce that `prepare` method is called with a unique `name` to avoid a runtime error',
    },
    fixable: 'code',
    messages: {
      enforcePrepareHasUniqueName:
        'Prepared statements `.prepare(...)` require a unique name. The name "{{preparedName}}" is also used at {{location}}',
    },
    schema: [
      {
        type: 'object',
        properties: {
          drizzleObjectName: {
            type: ['string', 'array'],
          },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context, _options) {
    const preparedStatementNames = new Map<string, QueryLocation[]>();

    return {
      CallExpression(node) {
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.property &&
          node.callee.property.type === 'Identifier' &&
          node.callee.property.name === 'prepare' &&
          node.arguments.length === 1 &&
          node.arguments[0]?.type === 'Literal'
        ) {
          const preparedName = node.arguments[0].value as string;
          const filePath = context.getFilename();
          const line = node.loc ? node.loc.start.line : 0;

          const collidingLocation = preparedStatementNames.get(preparedName);

          if (collidingLocation) {
            for (const location of collidingLocation) {
              const messageData = {
                location: `${location.filePath}:${location.line}`,
                preparedName,
              };
              context.report({
                node,
                messageId: 'enforcePrepareHasUniqueName',
                data: messageData,
              });
            }
            collidingLocation.push({ preparedName, node, filePath, line });
          } else {
            preparedStatementNames.set(preparedName, [
              { preparedName, node, filePath, line },
            ]);
          }
        }
        return;
      },
    };
  },
});

export default updateRule;
