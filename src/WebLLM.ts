import {type WebLLMAdapter} from "./types";
import {initAdapters, loadAdapters} from "./adapters"
import {Notice, type View} from "obsidian";
import PluginUtils from "./utils/pluginUtils";
import prompts from "./prompts";
// @ts-ignore
import {WebView} from "./utils/WebViewer";

export const WEB_LLM_VIEW_ID = "web-llm-view";

export default class WebLLM {
	adapters: WebLLMAdapter[];
	private curAdapter: WebLLMAdapter;
	private webView: WebView;
	private statusBarItem: HTMLElement;

	constructor() {
		PluginUtils.ws.onLayoutReady(async () => {
			await this.onLoad();
		})
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
		navigate && this.webView?.navigate(this.curAdapter.url);
	}

	private registerCommands() {
		PluginUtils.commander.register({
			id: "web-chat",
			name: "聊一下",
			hotkeys: [{modifiers: ["Alt"], key: "C"}],
			callback: () => this.chat(),
		}, {
			id: "new-web-chat",
			name: "选择提示词开启新聊天",
			hotkeys: [{modifiers: ["Alt"], key: "X"}],
			callback: async () => {
				const {prompt} = await PluginUtils.ui.showSuggester({
					items: prompts.map((item) => ({
						display: item.name,
						item: item,
						matchScope: item.name + item.prompt
					}))
				});
				await this.curAdapter.newChat(prompt);
			}
		}, {
			id: "get-recent-reply",
			name: "复制最新回复为MD",
			hotkeys: [{modifiers: ["Alt"], key: "Q"}],
			callback: async () => {
				const reply = await this.curAdapter.getCurrentReply();
				await window.navigator.clipboard.writeText(reply);
				new Notice("已复制最新回复");
			}
		}, {
			id: "enable-toolbar",
			name: "开启工具栏划词跟随",
			callback: async () => {
				PluginUtils.ui.setToolbarMode("selection");
				PluginUtils.ui.setToolbarItems({
					icon: "message-square-text", tooltip: "聊一下", callback: async () => await this.chat()
				})
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
				title: "开启新聊天",
				icon: "message-square-quote",
				subItems: prompts.map(({name, prompt}) => ({
					title: name, callback: () => this.curAdapter.newChat(prompt),
				}))
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
		const view = PluginUtils.ws.activeLeaf?.view;
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
		} catch (e) {
			console.error(e);
			notice = "回答异常！";
		}
		new Notice(notice);
		PluginUtils.ui.setStatusBarItem(this.statusBarItem, {display: notice, timeout: 5000});
	}

	async preprocess(selection: string, view: View) {
		const fileName = PluginUtils.formatter.lintName(selection);
		const type = view.getViewType();
		const notice = "回答中...";
		new Notice(notice);
		this.statusBarItem = PluginUtils.ui.addStatusBarItem({display: notice});
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
