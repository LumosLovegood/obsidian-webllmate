import {Menu, type Plugin, setIcon, View} from "obsidian";
import {Suggester, type SuggesterProps} from "./suggester";
import CursorToolBar, {type CursorTool, type CursorToolBarMode} from "./CursorToolBar";

interface MenuItem {
	title: string;
	callback?: () => void;
	icon?: string;
	subItems?: MenuItem[];
}

interface IconButton {
	icon: string;
	title: string;
	callback: () => Promise<void> | void;
}

interface ViewHeaderButton extends IconButton{
	id: string;
}

interface TextButton {
	display: string;
	tooltip?: string;
	callback?: (evt: MouseEvent) => Promise<void> | void;
}

interface StatusItemOption extends TextButton{
	timeout?: number;
}

export default class UIUtils {
	private toolbar: CursorToolBar;
	private headerButtons: HTMLElement[];

	constructor(private readonly plugin: Plugin) {
		this.toolbar = new CursorToolBar(plugin);
	}

	onUnload() {
		this.toolbar?.onUnload();
		this.headerButtons?.forEach((button) => button.remove());
	}

	setToolbarItems(...items: CursorTool[]) {
		this.toolbar.setTools(items);
	}

	setToolbarMode(mode: CursorToolBarMode) {
		this.toolbar.setMode(mode);
	}

	addMenuItem(
		menu: Menu,
		{title, icon, callback, subItems}: MenuItem
	) {
		menu.addItem((item) => {
			item.setTitle(title).setIcon(icon ?? "");
			subItems && this.addMenuItems(item.setSubmenu(), subItems);
			callback && item.onClick(callback);
		});
	}

	addMenuItems(menu: Menu, items: MenuItem[]) {
		if (!items || !items.length) {
			return;
		}
		menu.addSeparator();
		items.forEach((item) => this.addMenuItem(menu, item));
		menu.addSeparator();
	}

	addRibbon({icon, title, callback}: IconButton) {
		return this.plugin.addRibbonIcon(icon, title, callback);
	}

	addStatusBarItem(option: StatusItemOption) {
		const statusItem = this.plugin.addStatusBarItem();
		statusItem.addClass("mod-clickable");
		this.setStatusBarItem(statusItem, option);
		return statusItem;
	}

	setStatusBarItem(statusItem: HTMLElement, {display, tooltip, callback, timeout}: Partial<StatusItemOption>) {
		display && statusItem.setText(display);
		tooltip && statusItem.setAttrs({"aria-label": tooltip, "data-tooltip-position": "top"});
		callback && statusItem.addEventListener("click", callback);
		timeout && setTimeout(() => statusItem.hide(), timeout);
	}

	registerMenu(el: HTMLElement, items: MenuItem[]) {
		const menu = new Menu();
		this.addMenuItems(menu, items);
		el.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			e.stopPropagation();
			menu.showAtMouseEvent(e);
		});
	}

	async showSuggester(props: SuggesterProps) {
		const suggester = new Suggester(this.plugin.app, props);
		return suggester.promise;
	}

	setIconButton(el: HTMLElement, button: IconButton) {
		setIcon(el, button.icon);
		button.title && el.setAttribute("aria-label", button.title);
		el.addEventListener("click", button.callback);
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
		this.headerButtons.push(el);
		return el;
	}
}
