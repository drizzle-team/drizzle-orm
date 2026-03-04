import chalk from 'chalk';
import { Prompt, SelectState } from 'hanji';

export class Select extends Prompt<{ index: number; value: string }> {
	private readonly data: SelectState<{ label: string; value: string }>;

	constructor(items: string[]) {
		super();
		this.on('attach', (terminal) => terminal.toggleCursor('hide'));
		this.on('detach', (terminal) => terminal.toggleCursor('show'));

		this.data = new SelectState(
			items.map((it) => ({ label: it, value: `${it}-value` })),
		);
		this.data.bind(this);
	}

	render(status: 'idle' | 'submitted' | 'aborted'): string {
		if (status === 'submitted' || status === 'aborted') return '';

		let text = ``;
		this.data.items.forEach((it, idx) => {
			text += idx === this.data.selectedIdx
				? `${chalk.green('❯ ' + it.label)}`
				: `  ${it.label}`;
			text += idx !== this.data.items.length - 1 ? '\n' : '';
		});

		return text;
	}

	result() {
		return {
			index: this.data.selectedIdx,
			value: this.data.items[this.data.selectedIdx]!.value!,
		};
	}
}
