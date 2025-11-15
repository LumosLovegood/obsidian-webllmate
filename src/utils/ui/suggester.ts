import {type App, type FuzzyMatch, FuzzySuggestModal, prepareFuzzySearch} from "obsidian";

interface SuggesterItem {
	item: any;
	display: string;
	matchScope?: string;
}

export interface SuggesterProps {
	items: SuggesterItem[];
	onEmpty?: (value: string) => void;
	emptyStateText?: string;
}

export class Suggester extends FuzzySuggestModal<SuggesterItem> {
	private readonly items: SuggesterItem[];
	private readonly onEmpty?: (value: string) => void | undefined;
	private resolvePromise: (item: any) => void;
	private rejectPromise: (reason: string) => void;
	public promise: Promise<any>;

	constructor(app: App, {items, onEmpty, emptyStateText}: SuggesterProps) {
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

	renderSuggestion(item: FuzzyMatch<SuggesterItem>, el: HTMLElement) {
		super.renderSuggestion(item, el);
		if (item.item.display.contains(this.inputEl.value)) {
			el.createEl("strong", {text: `...${this.inputEl.value}...`});
		}
	}

	getSuggestions(query: string): FuzzyMatch<SuggesterItem>[] {
		const fuzzyQuery = prepareFuzzySearch(query);
		// @ts-ignore
		return this.items.map(item => ({
			item,
			match: fuzzyQuery(item.matchScope ?? item.display)
		})).filter(({match}) => match != null);
	}

	getItems(): SuggesterItem[] {
		return this.items;
	}

	getItemText(item: SuggesterItem): string {
		return item.display;
	}

	onChooseItem(item: SuggesterItem, evt: MouseEvent | KeyboardEvent) {
		this.resolvePromise(item.item);
	}

	onNoSuggestion() {
		this.onEmpty?.(this.inputEl.value);
		super.onNoSuggestion();
	}
}
