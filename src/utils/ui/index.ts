import {Menu, type Plugin, setIcon, View} from "obsidian";
import {Suggester, type SuggesterProps} from "./suggester";
import CursorToolBar, {type CursorTool, type CursorToolBarMode} from "./CursorToolBar";

interface MenuItem {
	title: string;
	callback?: () => void | Promise<void>;
	icon?: string;
	subItems?: MenuItem[];
}

interface IconButton {
	icon: string;
	title: string;
	callback: () => Promise<void> | void;
}

interface ViewHeaderButton extends IconButton {
	id: string;
}

interface TextButton {
	display: string;
	tooltip?: string;
	callback?: () => Promise<void> | void;
	styles?: Partial<CSSStyleDeclaration>;
}

interface StatusItemOption extends TextButton {
	timeout?: number;
}


function registerMenu(el: HTMLElement, items: MenuItem[], eventType: "contextmenu" | "click" = "contextmenu") {
	const menu = new Menu();
	addMenuItems(menu, items);
	el.addEventListener(eventType, (e) => {
		e.preventDefault();
		e.stopPropagation();
		menu.showAtMouseEvent(e);
	});
}

function addMenuItem(
	menu: Menu,
	{title, icon, callback, subItems}: MenuItem
) {
	menu.addItem((item) => {
		item.setTitle(title).setIcon(icon ?? "");
		if (subItems) {
			addMenuItems(item.setSubmenu(), subItems);
		}
		if (callback) {
			item.onClick(callback);
		}
	});
}

function addMenuItems(menu: Menu, items: MenuItem[]) {
	if (!items || !items.length) {
		return;
	}
	menu.addSeparator();
	items.forEach((item) => addMenuItem(menu, item));
	menu.addSeparator();
}

export class StatusBarItem<T extends string> {
	constructor(
		readonly element: HTMLElement,
		private readonly statusMap: Record<T, StatusItemOption>,
		status?: T
	) {
		element.addClass("mod-clickable");
		const values: StatusItemOption[] = Object.values(statusMap);
		if (values.length === 0) {
			throw new Error(`No status defined`);
		}
		if (values.filter(status => !!status.callback).length > 1) {
			registerMenu(element, values.map(value => ({
				title: value.display,
				callback: async () => {
					await value.callback?.();
					this.perform(value);
				},
			})), "click");
		}
		this.setStatus(status);
	}

	onUnLoad() {
		this.element.remove();
	}


	setStatus(status?: T): void {
		if (!status) {
			return this.element.hide();
		}
		const options = this.statusMap[status];
		if (!options) {
			return;
		}
		options.callback?.();
		this.perform(options);
	}

	private perform({display, tooltip, callback, timeout, styles}: StatusItemOption) {
		this.element.show();
		if (display) {
			this.element.setText(display);
		}
		if (tooltip) {
			this.element.setAttrs({"aria-label": tooltip, "data-tooltip-position": "top"});
		}
		if (callback) {
			this.element.addEventListener("click", callback);
		}
		if (styles) {
			this.element.setCssStyles(styles);
		}
		if (timeout) {
			setTimeout(() => this.element.hide(), timeout);
		}
	}
}

export default class UIUtils {
	private toolbar: CursorToolBar;
	private elements: HTMLElement[] = [];

	constructor(private readonly plugin: Plugin) {

	}

	onUnload() {
		this.toolbar?.onUnload();
		this.elements?.forEach((element) => element.remove());
	}

	getToolbar(mode: CursorToolBarMode = "onselect", ...tools: CursorTool[]) {
		this.toolbar ??= new CursorToolBar(this.plugin, mode);
		this.toolbar.setMode(mode);
		this.toolbar.setTools(tools);
		return this.toolbar;
	}

	addMenuItem(
		menu: Menu,
		item: MenuItem
	) {
		addMenuItem(menu, item)
	}

	addMenuItems(menu: Menu, items: MenuItem[]) {
		addMenuItems(menu, items);
	}

	addRibbon({icon, title, callback}: IconButton) {
		return this.plugin.addRibbonIcon(icon, title, callback);
	}

	createStatusBarItem<T extends string>(statuses: Record<string, StatusItemOption>, status?: T) {
		const element = this.plugin.addStatusBarItem();
		this.elements.push(element);
		return new StatusBarItem<T>(element, statuses, status);
	}

	registerMenu(el: HTMLElement, items: MenuItem[], eventType: "contextmenu" | "click" = "contextmenu") {
		registerMenu(el, items, eventType);
	}

	async showSuggester(props: SuggesterProps) {
		const suggester = new Suggester(this.plugin.app, props);
		return suggester.promise;
	}

	setIconButton(el: HTMLElement, {icon, title, callback}: IconButton) {
		setIcon(el, icon);
		if (title) {
			el.setAttribute("aria-label", title);
		}
		el.addEventListener("click", callback);
	}

	createHeaderButton(view: View, button: ViewHeaderButton) {
		// @ts-ignore
		view[button.id]?.remove();
		const moreEl = view.moreOptionsButtonEl;
		const buttonsAreaEl = moreEl.parentElement;
		const el = moreEl.cloneNode() as HTMLElement;
		this.setIconButton(el, button);
		buttonsAreaEl?.insertBefore(el, moreEl);
		// 	@ts-ignore
		view[button.id] = el;
		this.elements.push(el);
		return el;
	}
}
