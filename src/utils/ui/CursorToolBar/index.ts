import ToolBar from "./ToolBar.svelte";
import {type App, debounce, type Editor, Notice, type Plugin} from "obsidian";
import {StatusBarItem} from "../index";

export interface CursorTool {
	icon: string;
	tooltip: string;
	callback: (selection?: string) => void | Promise<void>;
}

export type CursorToolBarMode = "always" | "onselect" | "disabled";

export default class CursorToolBar {
	private readonly app: App;
	private instance: ToolBar;
	private visible = false;
	private mode: CursorToolBarMode = "onselect";
	private lastAltTime = 0;
	private tools: CursorTool[] = [];
	private status: StatusBarItem<CursorToolBarMode>;

	constructor(private readonly plugin: Plugin) {
		this.app = plugin.app;
		this.instance = new ToolBar({target: document.body});
		this.registerAutoUpdatePos();
		this.registerHideShortcut();
		this.registerShowShortcut();
		this.registerSelectionEvent();
		this.registerScrollEvent();
		this.registerLeafChange();
		this.registerStatus();
	}

	setTools(tools: CursorTool[]) {
		this.tools = tools;
		this.instance?.$set({tools});
	}

	addTool(tool: CursorTool) {
		this.tools.push(tool);
		this.instance?.$set({tools: this.tools});
	}

	onUnload() {
		this.instance?.$destroy();
		this.status.onUnLoad();
	}

	private setMode(mode: CursorToolBarMode) {
		this.mode = mode;
	}

	private toggle(visible: boolean) {
		if (this.tools.length === 0) {
			this.setTools([{
				icon: "earth",
				tooltip: "No Tools Found",
				callback: () => {
					new Notice("No Tools Found")
				}
			}])
		}
		this.instance.$set({visible});
		this.visible = visible;
	}

	private registerStatus() {
		this.status = new StatusBarItem<CursorToolBarMode>(
			this.plugin.addStatusBarItem(),
			{
				"disabled": {
					display: "隐藏",
					callback: () => this.setMode("disabled")
				},
				"always": {
					display: "常驻模式",
					callback: () => this.setMode("always")
				},
				"onselect": {
					display: "划线模式",
					callback: () => this.setMode("onselect")
				}
			}
		)
	}

	private registerAutoUpdatePos() {
		const eventRef = this.app.workspace.on('editor-change',
			(editor) => this.updateToolBarPosition(editor)
		);
		this.plugin.registerEvent(eventRef);
	}

	private registerLeafChange() {
		const eventRef = this.app.workspace.on("active-leaf-change", () => {
			const editor = this.app.workspace.activeEditor?.editor;
			if (!editor) {
				return;
			}
			this.app.workspace.activeEditor ? this.updateToolBarPosition(editor) : this.toggle(false)
		});
		this.plugin.registerEvent(eventRef);
	}

	private registerSelectionEvent() {
		const debouncer = debounce(() => {
			if (this.mode !== "onselect") {
				return;
			}
			this.updateToolBarPositionForSelection() && this.toggle(true);
		}, 500, true);
		this.plugin.registerDomEvent(document, 'selectionchange', () => debouncer());
	}

	private registerScrollEvent() {
		const debouncer = debounce((container: HTMLElement) => {
			if (this.mode !== "onselect") {
				this.toggle(false);
				return;
			}
			const updated = this.updateToolBarPositionForSelection(container);
			this.toggle(!!updated);
		}, 0, true);
		const eventRef = this.app.workspace.on('active-leaf-change', (leaf) => {
			if (!leaf) return;
			const view = leaf.view;
			const scrollContainer = view.containerEl.querySelector(
				'.markdown-preview-view, .cm-scroller, .pdf-viewer-container'
			) as HTMLElement;
			if (scrollContainer) {
				this.plugin.registerDomEvent(scrollContainer, "scroll", () => debouncer(scrollContainer));
			}
		});
		this.plugin.registerEvent(eventRef);
	}

	private updateToolBarPositionForSelection(container = document.body) {
		const selection = window.getSelection();
		const selectedText = selection?.toString().trim();
		if (!selection || !selectedText) {
			this.toggle(false);
			return false;
		}
		if (selectedText.length > 0) {
			const {focusNode, focusOffset} = selection;
			const focusRange = document.createRange();
			if (!focusNode) {
				return;
			}
			focusRange.setStart(focusNode, focusOffset);
			focusRange.setEnd(focusNode, focusOffset);
			let rect = focusRange.getBoundingClientRect();
			if (rect.width === 0 && rect.height === 0) {
				const allRects = selection.getRangeAt(0).getClientRects();
				if (allRects.length > 0) {
					const lastRect = allRects[allRects.length - 1];
					rect = {
						...lastRect,
						left: lastRect.left + lastRect.width,
					};
				}
			}
			if (rect.bottom >= 0 && rect.top <= container.innerHeight) {
				this.instance.$set({
					cursorY: rect.top + window.scrollY,
					cursorX: rect.left + window.scrollX
				});
				return true;
			}
			return false;
		}
	}

	private updateToolBarPosition(editor: Editor) {
		// @ts-ignore
		const pos = editor.coordsAtPos(editor.getCursor());
		if (pos) {
			this.instance.$set({cursorX: pos.left, cursorY: pos.top})
		}
	}

	private registerShowShortcut() {
		this.plugin.registerDomEvent(document, "keyup", (e) => {
			if (this.mode !== "always" || !this.app.workspace.activeEditor?.editor?.hasFocus()) {
				return;
			}
			const DOUBLE_ALT_TIMEOUT = 300;
			if (e.key === "Alt") {
				const now = Date.now();
				if (now - this.lastAltTime < DOUBLE_ALT_TIMEOUT) {
					this.updateToolBarPosition(this.app.workspace.activeEditor.editor);
					this.toggle(!this.visible);
					this.lastAltTime = 0;
				} else {
					this.lastAltTime = now;
				}
				e.preventDefault();
			}
		});
	}

	private registerHideShortcut() {
		this.plugin.registerDomEvent(document, "keyup", (e) => {
			if (e.key === "Escape") {
				this.toggle(false);
				e.preventDefault();
			}
		});
	}
}
