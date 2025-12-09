import type {WebViewElement} from './WebView';

export type InputType = "lexical" | "textarea" | "contenteditable" | "normal" | "controlled";


function escapeForTemplate(str: string): string {
	return str
		.replace(/`/g, "\\`")
		.replace(/\$/g, "\\$");
}

function escapeSelectorForJSString(selector: string): string {
	return selector
		.replace(/"/g, '\'');
}

function unifySelector(
	_target: any,
	_propertyKey: string,
	descriptor: PropertyDescriptor
) {
	const originalMethod = descriptor.value;
	descriptor.value = function (...args: any[]) {
		args[0] = escapeSelectorForJSString(args[0]);
		return originalMethod.apply(this, args);
	};
}

type ElementExpr = string;

interface WebExecutorUtil {
	name: string;
	definition: string;
	isAsync: boolean;
}

export default class WebExecutor {
	statements: string[] = [];
	lastResultVar: string | null = null;
	private namedResults: Record<string, string> = {};
	private nextId = 0;
	needsAsync = false;
	utils: WebExecutorUtil[] = [{
		name: "sleep",
		definition: "const sleep = ms => new Promise(r => setTimeout(r, ms));",
		isAsync: true,
	}, {
		name: "waitUntilElement",
		definition: `async (sel, timeout, interval=200) => {
          const start = Date.now();
          while (Date.now() - start < timeout) {
            const el = document.querySelector(sel);
            if (el) return el;
            await sleep(interval);
          }
          return null;
        };`,
		isAsync: true,
	}];

	constructor(private readonly webview: WebViewElement) {
	}

	registerUtil(util: WebExecutorUtil) {
		this.utils.push(util);
	}

	applyUtil(name: string, key?: string) {
		const util = this.utils.find(u => u.name === name);
		if (!util) {
			throw new Error(`Util Not Registered: ${name}`);
		}
		if (!util.isAsync) {
			this._setLastResult(`${name}();`, key);
		} else {
			this._setLastResult(`await ${name}();`, key);
			this.needsAsync = true;
		}
		return this;
	}

	@unifySelector
	query(selector: string): ElementRef {
		const varName = `_e${this.nextId++}`;
		this.statements.push(`const ${varName} = document.querySelector("${selector}");`);
		return new ElementRef(this, varName);
	}

	@unifySelector
	queryAll(selector: string): ElementListRef {
		const listVar = `_l${this.nextId++}`;
		this.statements.push(
			`const ${listVar} = Array.from(document.querySelectorAll("${selector}"));`
		);
		return new ElementListRef(this, listVar);
	}

	@unifySelector
	waitFor(selector: string, timeoutMs = 30_000, interval = 200): ElementRef {
		this.needsAsync = true;
		const varName = `_e${this.nextId++}`;
		this.statements.push(`
      const ${varName} = await waitUntilElement("${selector}", ${timeoutMs}, ${interval});
      if (!${varName}) throw new Error("Timeout waiting for element: ${selector}");
    `.trim());
		return new ElementRef(this, varName);
	}

	delay(ms: number): this {
		this.needsAsync = true;
		this.statements.push(`await sleep(${ms});`);
		this.lastResultVar = null;
		return this;
	}

	eval(script: string, key?: string): this {
		this._setLastResult(`(${script})`, key);
		return this;
	}

	_setLastResult(expr: string, key?: string): void {
		const resVar = `_r${this.nextId++}`;
		this.statements.push(`const ${resVar} = ${expr};`);
		this.lastResultVar = resVar;

		if (key !== undefined) {
			if (this.namedResults[key] !== undefined) {
				throw new Error(`Result key "${key}" is already used.`);
			}
			this.namedResults[key] = resVar;
		}
	}

	_perform(expr: string, action: string): this {
		this.statements.push(`${expr}?.${action};`);
		this.lastResultVar = null;
		return this;
	}

	async done<T = any>(options?: { all?: boolean }): Promise<T> {
		const utils = this.utils
			.filter(u => this.needsAsync || !u.isAsync)
			.map(u => u.definition)
			.join("\n");
		let script = `${utils}\n${this.statements.join("\n")}`;

		if (options?.all) {
			if (Object.keys(this.namedResults).length > 0) {
				const entries = Object.entries(this.namedResults)
					.map(([key, varName]) => `"${key}": ${varName}`)
					.join(', ');
				script += `\nreturn { ${entries} };`;
			} else {
				script += `\nreturn {};`;
			}
		} else {
			if (this.lastResultVar) {
				script += `\nreturn ${this.lastResultVar};`;
			}
		}

		const wrapper = this.needsAsync
			? `(async function() {\n${script}\n})()`
			: `(function() {\n${script}\n})()`;
		try {
			return await this.exec(wrapper) as Promise<T>;
		} finally {
			this.reset();
		}
	}

	reset(): this {
		this.statements = [];
		this.lastResultVar = null;
		this.namedResults = {};
		this.nextId = 0;
		this.needsAsync = false;
		return this;
	}

	@unifySelector
	async getText(selector: string): Promise<string> {
		return this.query(selector).text().done<string>();
	}

	@unifySelector
	async getHtml(selector: string): Promise<string> {
		return this.query(selector).html().done<string>();
	}

	@unifySelector
	async elementExists(selector: string): Promise<boolean> {
		return this.query(selector).exists().done<boolean>();
	}

	@unifySelector
	click(selector: string): WebExecutor {
		return this.query(selector).click();
	}

	@unifySelector
	input(
		selector: string,
		text: string,
		type: InputType = "normal",
	): WebExecutor {
		return this.query(selector).input(text, type);
	}

	@unifySelector
	remove(selector: string): WebExecutor {
		return this.query(selector).remove();
	}

	@unifySelector
	focus(selector: string): WebExecutor {
		this.webview.focus();
		return this.query(selector).focus();
	}

	async sleep(ms: number): Promise<void> {
		await new Promise(resolve => setTimeout(resolve, ms));
	}

	async exec(script: string): Promise<any> {
		return this.webview.executeJavaScript(script);
	}
}

class ElementRef {
	constructor(private executor: WebExecutor, private expr: ElementExpr) {
	}

	@unifySelector
	query(subSelector: string, global = false): ElementRef {
		const varName = `_e${this.executor['nextId']++}`;
		const source = global ? 'document' : this.expr;
		this.executor.statements.push(
			`const ${varName} = ${source}.querySelector("${subSelector}");`
		);
		return new ElementRef(this.executor, varName);
	}

	@unifySelector
	queryAll(subSelector: string, global = false): ElementListRef {
		const listVar = `_l${this.executor['nextId']++}`;
		const source = global ? 'document' : this.expr;
		this.executor.statements.push(
			`const ${listVar} = ${source} ? Array.from(${source}.querySelectorAll("${subSelector}")) : [];`
		);
		return new ElementListRef(this.executor, listVar);
	}

	@unifySelector
	waitFor(subSelector: string, timeoutMs = 30_000, interval = 200): ElementRef {
		const safeSel = escapeSelectorForJSString(subSelector);
		const varName = `_e${this.executor['nextId']++}`;
		this.executor.needsAsync = true;

		this.executor.statements.push(`
    const ${varName} = await (async () => {
      const start = Date.now();
      while (Date.now() - start < ${timeoutMs}) {
        const el = ${this.expr}.querySelector("${safeSel}");
        if (el) return el;
        await sleep(${interval});
      }
      return null;
    })();
    if (!${varName}) throw new Error("Timeout waiting for element: ${safeSel} inside ${this.expr}");
  `.trim());

		return new ElementRef(this.executor, varName);
	}

	perform(action: string): WebExecutor {
		return this.executor._perform(this.expr, `${action}`);
	}

	focus(): WebExecutor {
		return this.perform("focus()");
	}

	click(): WebExecutor {
		return this.perform("click()");
	}

	remove(): WebExecutor {
		return this.perform("remove()");
	}

	getAttr(attr: string, key?: string): any {
		this.executor._setLastResult(`${this.expr}?.${attr}`, key);
		return this.executor;
	}

	exists(key?: string): WebExecutor {
		this.executor._setLastResult(`!!(${this.expr})`, key);
		return this.executor;
	}

	text(key?: string): WebExecutor {
		return this.getAttr("textContent", key);
	}

	html(key?: string): WebExecutor {
		return this.getAttr("innerHTML", key);
	}

	setStyles(styles: Partial<CSSStyleDeclaration>): WebExecutor {
		for (const [key, value] of Object.entries(styles)) {
			if (typeof value === 'string') {
				this.executor.statements.push(
					`${this.expr}?.style.setProperty("${key}", "${value}");`
				);
			}
		}
		this.executor.lastResultVar = null;
		return this.executor;
	}

	hide(): WebExecutor {
		return this.setStyles({display: "none"});
	}

	show(): WebExecutor {
		return this.setStyles({display: ""});
	}

	isVisible(key?: string): WebExecutor {
		this.executor._setLastResult(
			`${this.expr} ? ${this.expr}.style.display !== "none" : false`,
			key
		);
		return this.executor;
	}

	input(text: string, type: InputType = "normal"): WebExecutor {
		const t = escapeForTemplate(text);
		const el = this.expr;
		let code: string;
		switch (type) {
			case "contenteditable":
				code = `${el}.textContent = \`${t}\`;`;
				break;
			case "lexical":
				code = `
					${el}.dispatchEvent(new InputEvent("input", { inputType: "insertFromPaste", data: \`${t}\`, bubbles: true }));
				`;
				break;
			case "textarea":
				code = `
					(() => {
						const e = ${el};
						if (!e) return;
						Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(e, \`${t}\`);
						e.dispatchEvent(new Event("input", { bubbles: true }));
					})();
				`;
				break;
			case "controlled":
				code = `
					(() => {
						const e = ${el};
						if (!e) return;
						const last = e.value;
						e.value = \`${t}\`;
						const ev = new Event("input", { bubbles: true });
						ev.simulated = true;
						const tracker = e._valueTracker;
						if (tracker) tracker.setValue(last);
						e.dispatchEvent(ev);
						e.dispatchEvent(new Event("change", { bubbles: true }));
					})();
				`;
				break;
			default:
				code = `
					${el}.value = \`${t}\`;
					${el}.dispatchEvent(new KeyboardEvent("input", { bubbles: true }));
				`;
		}
		this.executor.statements.push(code);
		this.executor.lastResultVar = null;
		return this.executor;
	}
}

class ElementListRef {
	constructor(private executor: WebExecutor, private listExpr: ElementExpr) {
	}

	at(index: number): ElementRef {
		const idxVar = `_i${this.executor['nextId']++}`;
		this.executor.statements.push(
			`const ${idxVar} = ((${this.listExpr}.length + (${index} % ${this.listExpr}.length)) % ${this.listExpr}.length);`
		);
		return new ElementRef(this.executor, `${this.listExpr}[${idxVar}]`);
	}

	first(): ElementRef {
		return this.at(0);
	}

	last(): ElementRef {
		return this.at(-1);
	}

	length(key?: string): WebExecutor {
		this.executor._setLastResult(`${this.listExpr}.length`, key);
		return this.executor;
	}

	find(type: "text", target: string): ElementRef;
	find(type: "attr", attrName: string, target: string | number | boolean): ElementRef;
	find(type: "text" | "attr", targetOrAttr: string, target?: string | number | boolean): ElementRef {
		const targetVar = `_e${this.executor['nextId']++}`;
		if (type === "text") {
			this.executor.statements.push(
				`const ${targetVar} = ${this.listExpr}.find(el => el?.textContent === "${targetOrAttr}");`
			);
			return new ElementRef(this.executor, targetVar);
		}
		const safeAttr = escapeSelectorForJSString(targetOrAttr);
		target = typeof target === "string" ? `"${target}"` : target;
		this.executor.statements.push(
			`const ${targetVar} = ${this.listExpr}.find(el => el?.getAttribute("${safeAttr}") === ${target});`
		);
		return new ElementRef(this.executor, targetVar);
	}


	map(type: "text", key?: string): WebExecutor;
	map(type: "attr", attrName: string, key?: string): WebExecutor;
	map(type: "text" | "attr", attrNameOrKey?: string, key?: string): WebExecutor {
		if (type === "text") {
			this.executor._setLastResult(`${this.listExpr}.map(el => el?.textContent)`, attrNameOrKey);
			return this.executor;
		}
		const safeAttr = escapeSelectorForJSString(attrNameOrKey as string);
		this.executor._setLastResult(
			`${this.listExpr}.map(el => el?.getAttribute("${safeAttr}"))`,
			key
		);
		return this.executor;
	}

	exists(key?: string): WebExecutor {
		this.executor._setLastResult(`${this.listExpr}.length > 0`, key);
		return this.executor;
	}
}
