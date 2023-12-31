import type { TSESTree } from '@typescript-eslint/utils';

export type Options = readonly [{
	drizzleObjectName: string[] | string;
}];

const isDrizzleObjName = (name: string, drizzleObjectName: string[] | string) => {
	if (typeof drizzleObjectName === 'string') {
		return name === drizzleObjectName;
	}

	if (Array.isArray(drizzleObjectName)) {
		if (drizzleObjectName.length === 0) {
			return true;
		}

		return drizzleObjectName.includes(name);
	}

	return false;
};

export const isDrizzleObj = (
	node: TSESTree.MemberExpression,
	options: Options,
) => {
	const drizzleObjectName = options[0].drizzleObjectName;

	if (node.object.type === 'Identifier') {
		return isDrizzleObjName(node.object.name, drizzleObjectName);
	} else if (node.object.type === 'MemberExpression' && node.object.property.type === 'Identifier') {
		return isDrizzleObjName(node.object.property.name, drizzleObjectName);
	} else if (node.object.type === 'CallExpression') {
		if (node.object.callee.type === 'Identifier') {
			return isDrizzleObjName(node.object.callee.name, drizzleObjectName);
		} else if (node.object.callee.type === 'MemberExpression' && node.object.callee.property.type === 'Identifier') {
			return isDrizzleObjName(node.object.callee.property.name, drizzleObjectName);
		}
	}

	return false;
};
