import type { TSESTree } from '@typescript-eslint/utils';

export type Options = readonly [{
	drizzleObjectName: string[] | string;
}];

export const isDrizzleObj = (
	node: TSESTree.MemberExpression,
	options: Options,
) => {
	const drizzleObjectName = options[0].drizzleObjectName;

	if (node.object.type === 'Identifier') {
		if (
			typeof drizzleObjectName === 'string'
			&& node.object.name === drizzleObjectName
		) {
			return true;
		}

		if (Array.isArray(drizzleObjectName)) {
			if (drizzleObjectName.length === 0) {
				return true;
			}

			if (drizzleObjectName.includes(node.object.name)) {
				return true;
			}
		}
	} else if (node.object.type === 'MemberExpression' && node.object.property.type === 'Identifier') {
		if (
			typeof drizzleObjectName === 'string'
			&& node.object.property.name === drizzleObjectName
		) {
			return true;
		}

		if (Array.isArray(drizzleObjectName)) {
			if (drizzleObjectName.length === 0) {
				return true;
			}

			if (drizzleObjectName.includes(node.object.property.name)) {
				return true;
			}
		}
	}

	return false;
};
