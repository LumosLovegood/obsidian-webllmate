import {
	App, Plugin, ItemView, WorkspaceLeaf,
	type IconName, type PaneType, type Side,
} from "obsidian";
import WebExecutor from "./WebExecutor";

const BUILTIN_WEBVIEW_TYPE = "webviewer";
const CUSTOM_WEBVIEW_TYPE = "custom-webview";

interface WebViewHooks {
	onWebviewInit?: (webview: WebView) => void | Promise<void>;
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

interface WebViewOptions extends WebViewUIOptions {
	builtinMode?: boolean;
	position?: Side | PaneType;
	hooks?: WebViewHooks;
	cookies?: string;
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
	private readonly app: App;

	constructor(private readonly plugin: Plugin) {
		this.app = plugin.app;
		this.plugin.registerView(CUSTOM_WEBVIEW_TYPE, leaf => new WebView(leaf, CUSTOM_WEBVIEW_TYPE));
	}

	get isBuiltinModeAvailable(): boolean {
		// @ts-ignore
		return !!this.app.setting.pluginTabs.find(tab => tab.id === BUILTIN_WEBVIEW_TYPE);
	}

	/**
	 * 创建 WebView
	 * @param leaf - WorkspaceLeaf | null | undefined. 用于创建WebView的leaf，如果为空则创建
	 * @param webViewOptions - WebViewOptions | undefined. 创建WebView的选项参数，默认为{}
	 *	  - builtinMode: boolean. 是否使用Obsidian内置的webviewer插件. 推荐开启;
	 *	  - position: Side | PanelType. 若leaf非空，此项参数忽略;若leaf为空，此项表示新建leaf的位置;
	 *	  - hooks: WebViewHooks. 钩子函数;
	 *	  - url: string. WebView创建后的导航地址;
	 *	  - cookies: string. WebView创建后需要注入的Cookies;
	 *	  - headerButtons: Array<ViewHeaderButton>. 视图的标题区的按钮;
	 *	  - panelMenuItems: Array<PanelMenuItem>. 视图panel的菜单项;
	 *	  - webMenuItems: Array<WebViewMenuItem>. 网页右键菜单，当前仅builtinMode为true时支持;
	 * @returns Promise<WebView>
	 */
	async createWebView(
		/*
		* */
		leaf?: WorkspaceLeaf | null | undefined,
		{
			builtinMode, position, hooks, url, cookies,
			headerButtons, panelMenuItems, webMenuItems
		}: WebViewOptions = {}
	): Promise<WebView> {
		// 如果未开启Obsidian内置的网页浏览器插件，降级到自定义WebView（Line: 212）实现
		// if the builtin webviewer plugin is not supported or disabled, fallback to custom WebView at Line:212
		const viewType = builtinMode && this.isBuiltinModeAvailable
			? BUILTIN_WEBVIEW_TYPE
			: CUSTOM_WEBVIEW_TYPE;
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
		await hooks?.onWebviewInit?.(view);
		hooks && this.registerWebHooks(view, hooks);
		cookies && await this.setCookies(view, cookies);
		// 如果url未定义，重新导航到原网址来触发注册的WebHook
		// if url is undefined, navigate to view.url again to trigger registered WebHooks
		view.navigate(url ?? view.url);
		this.registerUI(view, {headerButtons, panelMenuItems, webMenuItems});
		return view;
	}

	private registerUI(
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
			label: "复制指向划线处的链接",
			click: async (text: string) => {
				const encodedText = encodeURIComponent(text);
				await window.navigator.clipboard.writeText(`${view.url}#:~:text=${encodedText}`);
			},
			type: "selection"
		});
		panelMenuItems.push(consoleItem);
		this.registerViewPaneMenu(view, panelMenuItems);
		this.registerViewActions(view, headerButtons);
		this.registerContextMenu(view, webMenuItems);
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

	private async setCookies(view: WebView, cookie: string) {
		await view.webview.executeJavaScript(`document.cookie = ${cookie}`);
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

	private registerWebHooks(view: WebView, {onDomReady, onTitleUpdated}: WebViewHooks) {
		view.webview.addEventListener("dom-ready", () => onDomReady?.());
		view.webview.addEventListener("page-title-updated", (evt: any) => onTitleUpdated?.(evt.title));
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

	// TODO
	contextMenuItemsForSelection(text: string, isEditable: boolean) {
		return [];
	}

	// TODO
	contextMenuItemsForImg(url: string) {
		return [];
	}

	// TODO
	contextMenuItemsForLink(link: string, text: string) {
		return [];
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
