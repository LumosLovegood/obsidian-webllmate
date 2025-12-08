import {type WebLLMAdapter} from "./types";
import {initAdapters, loadAdapters} from "./adapters"
import {FileView, Notice, View} from "obsidian";
import PluginUtils from "./utils/pluginUtils";
import {WebView} from "./utils/webViewer";
import type {StatusBarItem} from "./utils/ui";
import type CursorToolBar from "./utils/ui/CursorToolBar";

export const WEB_LLM_VIEW_ID = "web-llm-view";

type statusKeys = "busy" | "error" | "complete";

export default class WebLLM {
	adapters: WebLLMAdapter[];
	private curAdapter: WebLLMAdapter;
	private webView: WebView;
	private answerStatus: StatusBarItem<statusKeys>;
	private toolbar: CursorToolBar;

	constructor() {
		PluginUtils.ws.onLayoutReady(async () => {
			await this.onLoad();
		});
	}

	onUnLoad() {
		this.webView.leaf?.detach();
	}

	private async onLoad(): Promise<void> {
		const leaf = PluginUtils.ws.getLeafById(
			PluginUtils.loadLocalStorage(WEB_LLM_VIEW_ID)
		);
		this.adapters = loadAdapters();
		this.webView = await PluginUtils.webViewer.createWebView(leaf, {
			builtinMode: true,
			position: "right",
			hooks: {
				onWebviewInit: (webview) => initAdapters(this.adapters, webview.executor),
				onDomReady: () => this.curAdapter.onLoad()
			},
			panelMenuItems: this.adapters.map(adapter => ({
				title: adapter.name,
				callback: () => this.switchAdapter(adapter.name),
				icon: "laptop-minimal"
			})),
		});
		PluginUtils.saveLocalStorage(WEB_LLM_VIEW_ID, this.webView.leaf.id);
		const adapter = this.adapters.find(adapter => PluginUtils.checker.isSameHost(adapter.url, this.webView.url));
		this.switchAdapter(adapter?.name, !adapter);
		this.registerCommands();
		this.registerEditorMenuItems();
		this.registerStatus();
		this.registerToolbar();
	}

	public switchAdapter(name = "Qwen", navigate = true) {
		if (name === this.curAdapter?.name) {
			return;
		}
		const adapter = this.adapters.find(adapter => adapter.name === name);
		if (!adapter) {
			new Notice(`未找到${name}适配器`);
			return;
		}
		this.curAdapter = adapter;
		if (navigate) {
			this.webView?.navigate(this.curAdapter.url);
		}
	}

	private registerStatus() {
		this.answerStatus = PluginUtils.ui.createStatusBarItem<statusKeys>({
			"busy": {
				display: "🔍回答中...",
			},
			"complete": {
				display: "✅回答完成！",
				timeout: 5000
			},
			"error": {
				display: "❌回答异常",
				tooltip: "请打开控制台看详细原因",
				timeout: 5000
			}
		});
	}

	private registerToolbar() {
		this.toolbar = PluginUtils.ui.getToolbar("onselect", {
			icon: "message-square-text", tooltip: "聊一下", callback: async () => await this.chat()
		});
	}

	private registerCommands() {
		PluginUtils.commander.register({
			id: "web-chat",
			name: "聊一下",
			hotkeys: [{modifiers: ["Alt"], key: "C"}],
			callback: async () => this.chat(),
		}, {
			id: "get-recent-reply",
			name: "复制最新回复为MD",
			hotkeys: [{modifiers: ["Alt"], key: "Q"}],
			callback: async () => {
				const reply = await this.curAdapter.getCurrentReply();
				await window.navigator.clipboard.writeText(reply);
				new Notice("已复制最新回复");
			}
		});
	}

	private registerEditorMenuItems() {
		PluginUtils.ws.on("editor-menu", (menu, editor) => {
			PluginUtils.ui.addMenuItems(menu, [{
				title: "聊一下",
				icon: "message-square-quote",
				callback: () => this.chat()
			}, {
				title: "查询历史记录",
				icon: "history",
				callback: () =>
					this.curAdapter.queryHistory(editor.getSelection())
			}])
		});
	}

	private async chat() {
		if (!this.curAdapter) {
			new Notice("当前适配器不可用");
			return;
		}
		const view = PluginUtils.ws.getActiveViewOfType<FileView>(FileView);
		if (!view) {
			new Notice("不支持的视图");
			return;
		}
		const selection = window.getSelection()?.toString();
		if (!selection) {
			new Notice("未选中内容");
			return;
		}
		const file = await this.preprocess(selection, view);
		let notice = "回答完成！";
		try {
			const result = await this.curAdapter.chat(selection);
			const source = `[From: ${this.curAdapter.name}](${this.webView.url}#:~:text=${encodeURIComponent(selection)})`;
			await PluginUtils.vault.append(file, result + "\n\n" + source);
			this.answerStatus.setStatus("complete");
		} catch (e) {
			console.error(e);
			notice = "回答异常！";
			this.answerStatus.setStatus("error");
		}
		new Notice(notice);
	}

	async preprocess(selection: string, view: View) {
		const fileName = PluginUtils.formatter.lintName(selection);
		const type = view.getViewType();
		const notice = "回答中...";
		new Notice(notice);
		this.answerStatus.setStatus("busy");
		let content = "";
		if (type === "markdown") {
			PluginUtils.ws.curEditor?.replaceSelection(`[[${fileName}|${selection}]]`);
		} else if (type === "pdf") {
			content = PluginUtils.vault.getPdfLink() + "\n\n";
		}
		return this.createNote(fileName, content);
	}

	async createNote(fileName: string, content: string) {
		const folderName = "Wiki/";
		if (!await PluginUtils.vault.exists(folderName)) {
			await PluginUtils.vault.createFolder(folderName);
		}
		const filePath = folderName + fileName + ".md";
		return PluginUtils.vault.create(filePath, content);
	}
}
