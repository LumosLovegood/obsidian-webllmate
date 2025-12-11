import {type App, type FuzzyMatch, FuzzySuggestModal, prepareFuzzySearch} from "obsidian";

interface SuggesterItem<T> {
	item: T;
	display: string;
	matchScope?: string;
}

export interface SuggesterProps<T> {
	items: SuggesterItem<T>[];
	onEmpty?: (value: string) => void;
	emptyStateText?: string;
}

export class Suggester<T> extends FuzzySuggestModal<SuggesterItem<T>> {
	private readonly items: SuggesterItem<T>[];
	private readonly onEmpty?: (value: string) => void | undefined;
	private resolvePromise: (item: any) => void;
	private rejectPromise: (reason: string) => void;
	public promise: Promise<T>;

	constructor(app: App, {items, onEmpty, emptyStateText}: SuggesterProps<T>) {
		super(app);
		this.items = items;
		this.onEmpty = onEmpty;
		this.emptyStateText = emptyStateText ?? this.emptyStateText;
		this.promise = new Promise<any>((resolve, reject) => {
			this.resolvePromise = resolve;
			this.rejectPromise = reject;
		});
		this.open();
	}

	renderSuggestion(item: FuzzyMatch<SuggesterItem<T>>, el: HTMLElement) {
		super.renderSuggestion(item, el);
		if (item.item.display.contains(this.inputEl.value)) {
			el.createEl("strong", {text: `...${this.inputEl.value}...`});
		}
	}

	getSuggestions(query: string): FuzzyMatch<SuggesterItem<T>>[] {
		const fuzzyQuery = prepareFuzzySearch(query);
		// @ts-ignore
		return this.items.map(item => ({
			item,
			match: fuzzyQuery(item.matchScope ?? item.display)
		})).filter(({match}) => match != null);
	}

	getItems(): SuggesterItem<T>[] {
		return this.items;
	}

	getItemText(item: SuggesterItem<T>): string {
		return item.display;
	}

	onChooseItem(item: SuggesterItem<T>) {
		this.resolvePromise(item.item);
	}

	onNoSuggestion() {
		this.onEmpty?.(this.inputEl.value);
		super.onNoSuggestion();
	}
}
