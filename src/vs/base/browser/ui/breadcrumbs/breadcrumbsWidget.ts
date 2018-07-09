/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./breadcrumbsWidget';
import * as dom from 'vs/base/browser/dom';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IMouseEvent } from 'vs/base/browser/mouseEvent';
import { Event, Emitter } from 'vs/base/common/event';
import { Color } from 'vs/base/common/color';
import { commonPrefixLength } from 'vs/base/common/arrays';

export abstract class BreadcrumbsItem {
	dispose(): void { }
	abstract equals(other: BreadcrumbsItem): boolean;
	abstract render(container: HTMLElement): void;
}

export class SimpleBreadcrumbsItem extends BreadcrumbsItem {

	constructor(
		readonly text: string,
		readonly title: string = text
	) {
		super();
	}

	equals(other: this) {
		return other === this || other instanceof SimpleBreadcrumbsItem && other.text === this.text && other.title === this.title;
	}

	render(container: HTMLElement): void {
		let node = document.createElement('div');
		node.title = this.title;
		node.innerText = this.text;
		container.appendChild(node);
	}
}

export interface IBreadcrumbsWidgetStyles {
	breadcrumbsBackground?: Color;
	breadcrumbsActiveForeground?: Color;
	breadcrumbsInactiveForeground?: Color;
}

export class BreadcrumbsWidget {

	private readonly _disposables = new Array<IDisposable>();
	private readonly _domNode: HTMLDivElement;
	private readonly _styleElement: HTMLStyleElement;
	private readonly _scrollable: DomScrollableElement;

	private readonly _onDidSelectItem = new Emitter<BreadcrumbsItem>();
	private readonly _onDidFocusItem = new Emitter<BreadcrumbsItem>();
	private readonly _onDidChangeFocus = new Emitter<boolean>();

	readonly onDidSelectItem: Event<BreadcrumbsItem> = this._onDidSelectItem.event;
	readonly onDidFocusItem: Event<BreadcrumbsItem> = this._onDidFocusItem.event;
	readonly onDidChangeFocus: Event<boolean> = this._onDidChangeFocus.event;

	private readonly _items = new Array<BreadcrumbsItem>();
	private readonly _nodes = new Array<HTMLDivElement>();
	private readonly _freeNodes = new Array<HTMLDivElement>();

	private _focusedItemIdx: number = -1;
	private _selectedItemIdx: number = -1;

	constructor(
		container: HTMLElement
	) {
		this._domNode = document.createElement('div');
		this._domNode.className = 'monaco-breadcrumbs';
		this._domNode.tabIndex = -1;
		this._scrollable = new DomScrollableElement(this._domNode, {
			vertical: ScrollbarVisibility.Hidden,
			horizontal: ScrollbarVisibility.Auto,
			horizontalScrollbarSize: 3,
			useShadows: false
		});
		this._disposables.push(this._scrollable);
		this._disposables.push(dom.addStandardDisposableListener(this._domNode, 'click', e => this._onClick(e)));
		container.appendChild(this._scrollable.getDomNode());

		this._styleElement = dom.createStyleSheet(this._domNode);

		let focusTracker = dom.trackFocus(this._domNode);
		this._disposables.push(focusTracker);
		this._disposables.push(focusTracker.onDidBlur(_ => this._onDidChangeFocus.fire(false)));
		this._disposables.push(focusTracker.onDidFocus(_ => this._onDidChangeFocus.fire(true)));
	}

	dispose(): void {
		dispose(this._disposables);
		this._domNode.remove();
		this._disposables.length = 0;
		this._nodes.length = 0;
		this._freeNodes.length = 0;
	}

	layout(dim: dom.Dimension): void {
		if (!dim) {
			this._scrollable.scanDomNode();
		} else {
			this._domNode.style.width = `${dim.width}px`;
			this._domNode.style.height = `${dim.height}px`;
			this._scrollable.scanDomNode();
		}
	}

	style(style: IBreadcrumbsWidgetStyles): void {
		let content = '';
		if (style.breadcrumbsBackground) {
			content += `.monaco-breadcrumbs { background-color: ${style.breadcrumbsBackground}}`;
		}
		if (style.breadcrumbsActiveForeground) {
			content += `.monaco-breadcrumbs:focus .monaco-breadcrumb-item { color: ${style.breadcrumbsActiveForeground}}\n`;
		}
		if (style.breadcrumbsInactiveForeground) {
			content += `.monaco-breadcrumbs .monaco-breadcrumb-item { color: ${style.breadcrumbsInactiveForeground}}\n`;
		}
		if (this._styleElement.innerHTML !== content) {
			this._styleElement.innerHTML = content;
		}
	}

	focus(): void {
		this._domNode.focus();
	}

	focusPrev(): any {
		this._focus((this._focusedItemIdx - 1 + this._nodes.length) % this._nodes.length);
		this._domNode.focus();
	}

	focusNext(): any {
		this._focus((this._focusedItemIdx + 1) % this._nodes.length);
		this._domNode.focus();
	}

	private _focus(nth: number): boolean {
		if (this._focusedItemIdx >= 0 && this._focusedItemIdx < this._nodes.length) {
			dom.removeClass(this._nodes[this._focusedItemIdx], 'focused');
			this._focusedItemIdx = -1;
		}
		if (nth < 0 || nth >= this._nodes.length) {
			return false;
		}
		this._focusedItemIdx = nth;
		dom.addClass(this._nodes[this._focusedItemIdx], 'focused');
		this._scrollable.setScrollPosition({ scrollLeft: this._nodes[this._focusedItemIdx].offsetLeft });
		this._onDidFocusItem.fire(this._items[this._focusedItemIdx]);
		return true;
	}

	getFocusedItem(): BreadcrumbsItem {
		return this._items[this._focusedItemIdx];
	}

	select(item: BreadcrumbsItem): void {
		this._select(this._items.indexOf(item));
	}

	private _select(nth: number): void {
		if (this._selectedItemIdx >= 0 && this._selectedItemIdx < this._nodes.length) {
			dom.removeClass(this._nodes[this._selectedItemIdx], 'selected');
			this._selectedItemIdx = -1;
		}
		if (nth < 0 || nth >= this._nodes.length) {
			return;
		}
		this._selectedItemIdx = nth;
		dom.addClass(this._nodes[this._selectedItemIdx], 'selected');
		this._onDidSelectItem.fire(this._items[this._selectedItemIdx]);
	}

	setItems(items: BreadcrumbsItem[]): void {
		let prefix = commonPrefixLength(this._items, items, (a, b) => a.equals(b));
		let removed = this._items.splice(prefix, this._items.length - prefix, ...items.slice(prefix));
		this._render(prefix);
		dispose(removed);
	}

	private _render(start: number): void {
		for (; start < this._items.length && start < this._nodes.length; start++) {
			let item = this._items[start];
			let node = this._nodes[start];
			this._renderItem(item, node);
		}
		// case a: more nodes -> remove them
		for (; start < this._nodes.length; start++) {
			this._nodes[start].remove();
			this._freeNodes.push(this._nodes[start]);
		}
		this._nodes.length = this._items.length;

		// case b: more items -> render them
		for (; start < this._items.length; start++) {
			let item = this._items[start];
			let node = this._freeNodes.length > 0 ? this._freeNodes.pop() : document.createElement('div');
			this._renderItem(item, node);
			this._domNode.appendChild(node);
			this._nodes[start] = node;
		}
		this.layout(undefined);
		this._focus(this._nodes.length - 1);
	}

	private _renderItem(item: BreadcrumbsItem, container: HTMLDivElement): void {
		dom.clearNode(container);
		item.render(container);
		dom.append(container);
		dom.addClass(container, 'monaco-breadcrumb-item');
	}

	private _onClick(event: IMouseEvent): void {
		for (let el = event.target; el; el = el.parentElement) {
			let idx = this._nodes.indexOf(el as any);
			if (idx >= 0) {
				this._focus(idx);
				this._select(idx);
				break;
			}
		}
	}
}
