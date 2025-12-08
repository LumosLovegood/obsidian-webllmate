import {
	App, Editor, TFile, Plugin,
	requestUrl, MetadataCache,
	normalizePath, stringifyYaml,
	Vault, Workspace, WorkspaceLeaf,
	type PluginManifest, type RequestUrlParam,
	type SplitDirection, type FrontMatterCache, type Command, FileView,
} from "obsidian";
import {fromBuffer} from "file-type";
import UIUtils from "./ui";
import WebViewer from "./webViewer";

type EnhancedCache = CacheEnhancer & MetadataCache;
type EnhancedWorkspace = WorkspaceEnhancer & Workspace;
type EnhancedVault = VaultEnhancer & Vault;

export default class PluginUtils {
	static app: App;
	static plugin: Plugin;
	static webViewer: WebViewer;
	static ui: UIUtils;
	private static _cache: EnhancedCache;
	private static _ws: EnhancedWorkspace;
	private static _vault: EnhancedVault;
	private static _commander: Commander;
	private static _editor: EditorUtil;
	private static _html: HtmlUtil;
	private static _checker: Checker;
	private static _formatter: Formatter;

	static bind(plugin: Plugin): void {
		this.plugin = plugin;
		this.app = plugin.app;
		this.webViewer = new WebViewer(this.plugin);
		this.ui = new UIUtils(this.plugin);
	}

	static onUnload(): void {
		this.ui?.onUnload();
	}

	static get cache(): EnhancedCache {
		return this._cache ??= new CacheEnhancer(this.app.metadataCache).perform();
	}

	static get ws(): EnhancedWorkspace {
		return this._ws ??= new WorkspaceEnhancer(this.app.workspace).perform();
	}

	static get vault(): EnhancedVault {
		return this._vault ??= new VaultEnhancer(this.app.vault).perform();
	}

	static get commander(): Commander {
		return this._commander ??= new Commander(this.plugin);
	}

	static get editor(): EditorUtil {
		return this._editor ??= new EditorUtil();
	}

	static get html(): HtmlUtil {
		return this._html ??= new HtmlUtil();
	}

	static get checker(): Checker {
		return this._checker ??= new Checker();
	}

	static get formatter(): Formatter {
		return this._formatter ??= new Formatter();
	}

	static openPluginSettingTab(): void {
		this.app.setting.open();
		this.app.setting.openTabById(this.id);
	}

	static openPluginHotkeyTab(): void {
		this.app.setting.open();
		this.app.setting.openTabById("hotkeys").setQuery(this.id);
	}

	static async loadData() {
		return this.plugin.loadData();
	}

	static async saveData(data: any): Promise<void> {
		await this.plugin.saveData(data);
	}

	static saveLocalStorage(key: string, value: string): void {
		return this.app.saveLocalStorage(key, value);
	}

	static loadLocalStorage(key: string): string {
		return this.app.loadLocalStorage(key);
	}

	static get manifest(): PluginManifest {
		return this.plugin.manifest;
	}

	static getPluginInfoByKey(key: keyof PluginManifest): string {
		return this.manifest[key] as string;
	}

	static get pluginName(): string {
		return this.getPluginInfoByKey("name");
	}

	static get authorUrl(): string {
		return this.getPluginInfoByKey("authorUrl");
	}

	static get id(): string {
		return this.getPluginInfoByKey("id");
	}
}


class Enhancer<T extends object> {
	constructor(protected readonly origin: T) {
	}

	perform() {
		return new Proxy(this, {
			get: (target, p, receiver) => {
				if (Reflect.has(target, p)) {
					return Reflect.get(target, p, receiver);
				}
				// 拦截on方法然后调用plugin.registerEvent()注册，以便插件卸载时可以自动清除事件
				// Intercept the on() method and automatically use plugin.registerEvent()
				// to register events, so that the plugin will automatically offRef events
				// when unload it
				if (p === "on") {
					const onFunc = Reflect.get(this.origin, p);
					const origin = this.origin;
					return function (this: unknown, ...args: unknown[]) {
						// @ts-ignore
						const eventRef = onFunc.apply(origin, args);
						PluginUtils.plugin.registerEvent(eventRef);
						return eventRef;
					};
				}
				return Reflect.get(this.origin, p);
			},
		}) as this & T;
	}
}

class CacheEnhancer extends Enhancer<MetadataCache> {
	getFrontMatter(file: TFile): FrontMatterCache {
		if (!file || !file.path) {
			return {};
		}
		return this.origin.getFileCache(file)?.frontmatter ?? {};
	}

	get curFrontMatter(): FrontMatterCache {
		const file = PluginUtils.ws.getActiveFileView()?.file;
		return file ? this.getFrontMatter(file) : {};
	}

	getFrontMatterValue(file: TFile, key: string): any {
		if (!file || !file.path) {
			return undefined;
		}
		return this.getFrontMatter(file)[key];
	}

	async updateFrontMatter(file: TFile, key: string, value: any): Promise<void> {
		const cache = this.origin.getFileCache(file);
		if (!cache || !cache.frontmatter || !cache.frontmatterPosition) {
			return;
		}
		const {frontmatter, frontmatterPosition} = cache;
		frontmatter[key] = value;
		const updatedText = `---\n${stringifyYaml(frontmatter)}\n---`;
		const content = await PluginUtils.vault.read(file);
		const start = frontmatterPosition.start.offset;
		const end = frontmatterPosition.end.offset;
		const before = content.substring(0, start);
		const after = content.substring(end);
		await PluginUtils.vault.modify(file, before + updatedText + after);
	}
}


class VaultEnhancer extends Enhancer<Vault> {

	getResourcePath(path: string): string {
		const file = PluginUtils.cache.getFirstLinkpathDest(path, "");
		if (file) return this.origin.getResourcePath(file);
		return "";
	}

	getLocalFilePath(path: string): string {
		const file = PluginUtils.cache.getFirstLinkpathDest(path, "");
		if (!file) {
			return "";
		}
		const basePath = this.origin.adapter.basePath;
		return normalizePath(basePath + "/" + file.path);
	}

	get attachmentDir(): string {
		return this.origin.config["attachmentFolderPath"] as string || "";
	}

	get absConfigDir(): string {
		return normalizePath(
			this.origin.adapter.basePath + "/" + this.origin.configDir
		);
	}

	getBaseNameByPath(path: string): string {
		return this.origin.getFileByPath(path)?.basename ?? "";
	}

	async saveBinary(arrayBuffer: ArrayBuffer, fileName?: string): Promise<TFile> {
		fileName = fileName ? PluginUtils.formatter.lintName(fileName) : crypto.randomUUID();
		const ext = await this.getExtension(arrayBuffer);
		const savePath = normalizePath(`${this.attachmentDir}/${fileName}.${ext}`);
		return this.origin.createBinary(savePath, arrayBuffer);
	}

	async saveBase64(base64Content: string, path?: string): Promise<TFile> {
		const buffer = this.base64toBuffer(base64Content);
		return this.saveBinary(buffer, path);
	}

	async downloadBinary(request: string | RequestUrlParam, path?: string): Promise<TFile> {
		const response = await requestUrl(request);
		const buffer = response.arrayBuffer;
		return this.saveBinary(buffer, path);
	}

	base64toBuffer(base64Content: string) {
		const regex = /^data:image\/\w+;base64,/;
		const code = base64Content.replace(regex, "");
		return Buffer.from(code, "base64");
	}

	async getExtension(content: ArrayBuffer) {
		return (await fromBuffer(content))?.ext as string;
	}

	getPdfLink(): string {
		const view = PluginUtils.ws.getActiveViewOfType<FileView>(FileView);
		if (!view || !view.file || view.getViewType() !== "pdf") {
			throw new Error(`Not PDFView`);
		}
		const selection = getSelection();
		if (!selection) {
			return `[[${view.file.name}]]`;
		}
		const text = selection.toString().replace(/\n/g, " ");
		const anchorIdx = PluginUtils.html.getAncestorAttr(selection.anchorNode, "data-idx");
		const focusIdx = PluginUtils.html.getAncestorAttr(selection.focusNode, "data-idx");
		const from = anchorIdx === focusIdx
			? Math.min(selection.anchorOffset, selection.focusOffset)
			: selection.anchorOffset;
		const to = anchorIdx === focusIdx
			? Math.max(selection.anchorOffset, selection.focusOffset)
			: selection.focusOffset;
		const page = PluginUtils.html.getAncestorAttr(selection.anchorNode, "data-page-number");
		return `[[${view.file.name}#page=${page}&selection=${anchorIdx},${from},${focusIdx},${to}|${text + "——" + view.file.name}]]`;
	}

	get fs() {
		// @ts-ignore
		return this.origin.adapter.fs;
	}
}

class WorkspaceEnhancer extends Enhancer<Workspace> {

	get curEditor(): Editor | undefined {
		return this.origin.activeEditor?.editor;
	}

	getSplitLeaf(direction: SplitDirection): WorkspaceLeaf {
		return this.origin.getLeaf("split", direction);
	}

	collapseSides() {
		this.origin.leftSplit.collapse();
		this.origin.rightSplit.collapse();
	}

	toggleLeftRibbon(show?: boolean): void {
		show = show ?? !this.origin.leftRibbon.hidden;
		if (show) {
			return this.origin.leftRibbon.hide();
		}
		this.origin.leftRibbon.show();
	}
}

class Commander {
	private _regex = /^.*:\s?/;

	constructor(private readonly plugin: Plugin) {
	}

	private get regex(): RegExp {
		this._regex.lastIndex = 0;
		return this._regex;
	}

	get commands(): Command[] {
		return this.plugin.app.commands.listCommands();
	}

	get pluginCommands(): Command[] {
		return this.commands.filter(
			({id}) => id.startsWith(this.plugin.manifest.id)
		);
	}

	register(...commands: Command[]) {
		commands.forEach((command) => {
			command.name = command.name.replace(this.regex, "");
			command.id = command.name.replace(this.regex, "");
			this.plugin.addCommand(command);
		});
	}

	unregister(...commands: Command[]) {
		commands.forEach((command) => {
			this.plugin.removeCommand(command.id.replace(this.regex, ""));
		});
	}

	find(id: string): Command | undefined {
		return this.commands.find(command => command.id === id);
	}

	executeById(id: string) {
		this.plugin.app.commands.executeCommandById(id);
	}

	execute(command: Command) {
		this.plugin.app.commands.executeCommand(command);
	}
}

class EditorUtil {
	getLineOfCursor(editor?: Editor) {
		editor = editor ?? PluginUtils.ws.curEditor;
		if (!editor) {
			return "";
		}
		const {line} = editor.getCursor();
		return editor.getLine(line);
	}

	setCursorBottom(editor?: Editor) {
		editor = editor ?? PluginUtils.ws.curEditor;
		if (!editor) {
			return;
		}
		editor.focus();
		const line = editor.lineCount() - 1;
		editor.setCursor({
			line: line,
			ch: editor.getLine(line).length,
		});
	}

	insertToCursor(content: string, editor?: Editor) {
		editor = editor ?? PluginUtils.ws.curEditor;
		if (!editor) return;
		const curLineContent = this.getLineOfCursor(editor);
		if (curLineContent === "") editor.replaceSelection(content);
		else editor.replaceSelection("\n" + content);
	}
}

class HtmlUtil {
	getAncestorAttr(el: HTMLElement | Node | null, attr: string): string | null {
		if (!el) {
			return null;
		}
		if ("getAttribute" in el && el.getAttribute(attr)) {
			return el.getAttribute(attr);
		}
		return this.getAncestorAttr(el.parentElement, attr);
	}
}


class Checker {
	isSameHost(url1: string, url2: string) {
		try {
			const hostname1 = new URL(url1).hostname;
			const hostname2 = new URL(url2).hostname;
			return hostname1 === hostname2;
		} catch {
			return false;
		}
	}
}

class Formatter {
	get time() {
		return window.moment().format("YYYY-MM-DD HH:mm:ss");
	}

	lintName(name: string, replace = "") {
		const regex = /[\\/:*?"<>|\n]/g;
		return name.replace(regex, replace);
	}

	get timeName() {
		return window.moment().format("YYYYMMDDHHmmssSSS");
	}

	seconds2str(seconds: number): string {
		const totalSeconds = Math.floor(seconds);
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const secs = totalSeconds % 60;
		const formatTime = (time: number) => time.toString().padStart(2, "0");
		return `${hours > 0 ? hours + ":" : ""}${formatTime(minutes)}:${formatTime(secs)}`;
	}

	str2seconds(timeStr: string) {
		const timeArr = timeStr.split(":").reverse();
		let seconds = 0;
		timeArr.forEach((t, i) => (seconds += Number(t) * 60 ** i));
		return seconds;
	}
}
