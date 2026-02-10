import { entityKind } from '~/entity.ts';
import type { Table } from '~/table.ts';

export class CommentBuilder {
	static readonly [entityKind]: string = 'PgTableCommentBuilder';

	protected brand!: 'PgTableCommentBuilder';

	constructor(public comment: string) {}

	/** @internal */
	build(table: Table): Comment {
		return new Comment(table, this);
	}
}

export class Comment {
	static readonly [entityKind]: string = 'PgTableComment';

	readonly comment: string;

	constructor(public table: Table, builder: CommentBuilder) {
		this.comment = builder.comment;
	}
}

export function comment(comment: string): CommentBuilder {
	return new CommentBuilder(comment);
}
