import {type IconName, ItemView, type WorkspaceLeaf} from "obsidian";
import type WebExecutor from "./WebExecutor";

export interface WebViewElement extends HTMLElement {
	loadURL: (url: string) => void;
	getURL: () => string;
	getTitle: () => string;
	executeJavaScript: (script: string, userGesture?: boolean) => Promise<any>;
	isDevToolsOpened: () => boolean;
	openDevTools: () => void;
	src: string;
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
		if (this.url) {
			this.navigate(this.url);
		}
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

	protected on(eventType: string, listener: (...args: any[]) => void) {
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
		webviewEl.addEventListener("page-title-updated", () => this.updateInfo());
		webviewEl.addEventListener("did-navigate-in-page", () => this.updateInfo());
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
