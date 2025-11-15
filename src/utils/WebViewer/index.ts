import {
	App, Plugin, ItemView, WorkspaceLeaf,
	type IconName, type PaneType, type Side,
} from "obsidian";
import WebExecutor from "./WebExecutor";

const BUILTIN_WEBVIEW_TYPE = "webviewer";
const CUSTOM_WEBVIEW_TYPE = "custom-webview";

interface WebViewerHooks {
	onDomReady?: () => void | Promise<void>;
	onTitleUpdated?: (title: string) => void | Promise<void>;
}

export interface WebViewElement extends HTMLElement {
	loadURL: (url: string) => void;
	getURL: () => string;
	getTitle: () => string;
	executeJavaScript: (script: string, userGesture?: boolean) => Promise<any>;
	isDevToolsOpened: () => boolean;
	openDevTools: () => void;
	src: string;
}

interface PanelMenuItem {
	title: string;
	callback?: () => any;
	icon?: string;
}

interface WebViewMenuItem {
	label: string;
	click: (data: string, param?: string | boolean) => void;
	type: "selection" | "image" | "link";
}

interface WebViewOptions {
	builtinMode?: boolean;
	position?: Side | PaneType;
	hooks?: WebViewerHooks;
	url?: string;
}

interface WebViewUIOptions {
	panelMenuItems?: PanelMenuItem[];
	headerButtons?: ViewHeaderButton[];
	webMenuItems?: WebViewMenuItem[];
}

interface ViewHeaderButton {
	icon: string;
	title: string;
	callback: () => Promise<void> | void;
}

export default class WebViewer {
	enableBuiltin: boolean;
	private readonly app: App;

	constructor(private readonly plugin: Plugin) {
		this.app = plugin.app;
		this.enableBuiltin = this.isBuiltinAvailable();
		this.plugin.registerView(CUSTOM_WEBVIEW_TYPE, leaf => new WebView(leaf, CUSTOM_WEBVIEW_TYPE));
	}

	perform(
		view: WebView,
		{headerButtons, panelMenuItems, webMenuItems}: WebViewUIOptions
	) {
		panelMenuItems ??= [];
		headerButtons ??= [];
		webMenuItems ??= [];
		const consoleItem = {
			icon: "bug-play",
			title: "网页调试",
			callback: () => {
				!view.webview.isDevToolsOpened() && view.webview.openDevTools();
			}
		}
		view.getViewType() === CUSTOM_WEBVIEW_TYPE && panelMenuItems?.push({
			icon: "external-link",
			title: "在外部打开",
			callback: () => window.open(view.url, "_external")
		});
		webMenuItems.push({
			label: "复制指向突出显示的链接",
			click: async (text: string) => {
				const encodedText = encodeURIComponent(text);
				await window.navigator.clipboard.writeText(`${view.url}#:~:text=${encodedText}`);
			},
			type: "selection"
		});
		panelMenuItems.push(consoleItem);
		headerButtons.push(consoleItem);
		this.registerViewPaneMenu(view, panelMenuItems);
		this.registerViewActions(view, headerButtons);
		this.registerContextMenu(view, webMenuItems);
	}

	async createWebView(
		leaf?: WorkspaceLeaf | null,
		{builtinMode, position, hooks, url}: WebViewOptions = {}
	): Promise<WebView> {
		const viewType = builtinMode ? BUILTIN_WEBVIEW_TYPE : CUSTOM_WEBVIEW_TYPE;
		if (!leaf) {
			leaf = await this.createLeaf(viewType, position);
		}
		if (![BUILTIN_WEBVIEW_TYPE, CUSTOM_WEBVIEW_TYPE].contains(leaf.view.getViewType())) {
			await leaf.setViewState({
				type: builtinMode ? BUILTIN_WEBVIEW_TYPE : CUSTOM_WEBVIEW_TYPE,
				active: true,
			});
		}
		const view = leaf.view as WebView;
		view.executor = new WebExecutor(view.webview);
		hooks && this.registerWebHooks(view, hooks);
		/*如果url未定义，重新导航到原网址来触发注册的WebHook
		if not url, navigate to view.url again to trigger registered WebHooks*/
		view.navigate(url ?? view.url);
		return view;
	}

	private async createLeaf(viewType: "custom-webview" | "webviewer", position?: Side | PaneType,): Promise<WorkspaceLeaf> {
		let leaf: WorkspaceLeaf;
		position ??= "tab";
		if (position === "left" || position === "right") {
			leaf = await this.app.workspace.ensureSideLeaf(viewType, position, {active: true});
		} else {
			leaf = this.app.workspace.getLeaf(position);
		}
		return leaf;
	}

	private registerViewPaneMenu(view: WebView, menuItems: PanelMenuItem[]) {
		const original = view.onPaneMenu;
		view.onPaneMenu = function (...args) {
			original.apply(this, args);
			const [menu] = args;
			menu.addSeparator();
			menuItems.forEach(({title, icon, callback}) => {
				menu.addItem((item) => {
					item.setTitle(title).setIcon(icon ?? "");
					callback && item.onClick(callback);
				});
			});
			menu.addSeparator();
		};
	}

	private registerViewActions(view: WebView, headerButtons: ViewHeaderButton[]) {
		headerButtons.forEach(({icon, callback, title}) => view.addAction(icon, title, callback));
	}

	private registerContextMenu(view: WebView, webviewMenuItems: WebViewMenuItem[]) {
		if (view.getViewType() !== BUILTIN_WEBVIEW_TYPE) {
			return;
		}
		this.modifyContextMenuFunc(view, "contextMenuItemsForLink",
			webviewMenuItems.filter((item) => item.type === "link")
		);
		this.modifyContextMenuFunc(view, "contextMenuItemsForImg",
			webviewMenuItems.filter((item) => item.type === "image")
		);
		this.modifyContextMenuFunc(view, "contextMenuItemsForSelection",
			webviewMenuItems.filter((item) => item.type === "selection")
		);
	}

	private modifyContextMenuFunc(
		view: WebView,
		funcName: "contextMenuItemsForLink" | "contextMenuItemsForImg" | "contextMenuItemsForSelection",
		webMenuItems: WebViewMenuItem[]
	) {
		const original = view[funcName];
		view[funcName] = function (...args: any[]) {
			const items = original.apply(this, args);
			items.push({type: "separator"});
			webMenuItems
				.forEach(({label, click}) =>
					// @ts-ignore
					items.push({label, click: () => click(...args)})
				);
			return items;
		};
	}

	private registerWebHooks(view: WebView, hooks: WebViewerHooks) {
		view.webview.addEventListener("dom-ready", () => {
			hooks?.onDomReady?.();
		});
		view.webview.addEventListener("page-title-updated", (evt: any) => {
			hooks?.onTitleUpdated?.(evt.title);
		});
	}

	private isBuiltinAvailable() {
		// @ts-ignore
		return !!this.app.setting.pluginTabs.find(tab => tab.id === BUILTIN_WEBVIEW_TYPE);
	}
}


export class WebView extends ItemView {
	executor: WebExecutor;
	webview: WebViewElement;
	url: string;
	title: string;

	constructor(
		leaf: WorkspaceLeaf,
		private viewType: string,
	) {
		super(leaf);
		this.url = leaf.getViewState().state?.url as string ?? "";
		this.title = leaf.getViewState().state?.title as string ?? viewType;
	}

	async onOpen(): Promise<void> {
		this.webview = this.createWebViewEl();
		this.url && this.navigate(this.url);
	}

	navigate(url: string) {
		this.webview.src = url;
	}

	contextMenuItemsForSelection(text: string, isEditable: boolean) {
	}

	contextMenuItemsForImg(url: string) {
	}

	contextMenuItemsForLink(link: string, text: string) {
	}

	getViewType(): string {
		return this.viewType;
	}

	getDisplayText(): string {
		return this.viewType;
	}

	getIcon(): IconName {
		return "earth";
	}

	updateInfo() {
		this.title = this.webview.getTitle();
		this.url = this.webview.getURL();
		this.leaf.tabHeaderInnerTitleEl.setText(this.title);
		this.leaf.tabHeaderEl.setAttribute("aria-label", this.title);
		this.leaf.tabHeaderInnerTitleEl.setAttribute("aria-label", this.title);
		this.leaf.containerEl
			.querySelector(".view-header-title")
			?.setText(this.url);
		this.app.workspace.requestSaveLayout();
	}

	protected async on(eventType: string, listener: (...args: any[]) => void) {
		this.webview.addEventListener(eventType, listener);
	}

	private createWebViewEl(): WebViewElement {
		this.contentEl.addClass("webviewer-content");
		const webviewEl = document.createElement("webview") as WebViewElement;
		webviewEl.setAttribute("allowpopups", "true");
		// @ts-ignore
		webviewEl.setAttribute("partition", `persist:vault-${this.app.appId}`);
		webviewEl.setCssStyles({backgroundColor: "white"});
		this.contentEl.appendChild(webviewEl);
		webviewEl.addEventListener("page-title-updated", async () => this.updateInfo());
		webviewEl.addEventListener("did-navigate-in-page", async () => this.updateInfo());
		// Refer: https://github.com/PKM-er/Obsidian-Surfing/blob/main/src/surfingViewNext.ts#L63
		webviewEl.addEventListener("page-favicon-updated", (event: any) => {
			if (event.favicons[0] !== undefined) {
				const favicon = document.createElement('img');
				favicon.src = event.favicons[0];
				favicon.width = 16;
				favicon.height = 16;
				this.leaf.tabHeaderInnerIconEl.empty();
				this.leaf.tabHeaderInnerIconEl.appendChild(favicon);
			}
		});
		return webviewEl;
	}

	getState(): Record<string, string> {
		return {
			url: this.url,
			title: this.title,
		}
	}
}
