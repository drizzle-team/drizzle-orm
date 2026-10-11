import type { TSESTree } from '@typescript-eslint/utils';

const getPropertyName = (node: TSESTree.MemberExpression) => {
	if (node.computed) {
		return undefined;
	}
	return node.property.type === 'PrivateIdentifier' ? `#${node.property.name}` : node.property.name;
};

export const resolveMemberExpressionPath = (node: TSESTree.MemberExpression) => {
	let objectExpression = node.object;
	let fullName = '';

	const addToFullName = (name: string) => {
		const prefix = fullName ? '.' : '';
		fullName = `${name}${prefix}${fullName}`;
	};

	while (objectExpression) {
		if (objectExpression.type === 'MemberExpression') {
			const propertyName = getPropertyName(objectExpression);
			if (propertyName) {
				addToFullName(propertyName);
			}
			objectExpression = objectExpression.object;
		} else if (objectExpression.type === 'CallExpression' && objectExpression.callee.type === 'Identifier') {
			addToFullName(`${objectExpression.callee.name}(...)`);
			break;
		} else if (objectExpression.type === 'CallExpression' && objectExpression.callee.type === 'MemberExpression') {
			const propertyName = getPropertyName(objectExpression.callee);
			if (propertyName) {
				addToFullName(`${propertyName}(...)`);
			}
			objectExpression = objectExpression.callee.object;
		} else if (objectExpression.type === 'Identifier') {
			addToFullName(objectExpression.name);
			break;
		} else if (objectExpression.type === 'ThisExpression') {
			addToFullName('this');
			break;
		} else {
			break;
		}
	}

	return fullName;
};
