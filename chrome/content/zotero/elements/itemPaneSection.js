/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2024 Corporation for Digital Scholarship
					 Vienna, Virginia, USA
					 https://www.zotero.org
	
	This file is part of Zotero.
	
	Zotero is free software: you can redistribute it and/or modify
	it under the terms of the GNU Affero General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.
	
	Zotero is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU Affero General Public License for more details.
	
	You should have received a copy of the GNU Affero General Public License
	along with Zotero.  If not, see <http://www.gnu.org/licenses/>.
	
	***** END LICENSE BLOCK *****
*/


class ItemPaneSectionElementBase extends XULElementBase {
	get item() {
		return this._item;
	}

	set item(item) {
		let success = this._handleDataChange("item", item);
		if (success === false) return;
		this._item = item;
	}

	get mode() {
		return this._mode;
	}

	set mode(mode) {
		let success = this._handleDataChange("mode", mode);
		if (success === false) return;
		this._mode = mode;
		this.setAttribute('mode', mode);
	}

	get inTrash() {
		return this._inTrash;
	}

	set inTrash(inTrash) {
		let success = this._handleDataChange("inTrash", inTrash);
		if (success === false) return;
		this._inTrash = inTrash;
	}

	get tabType() {
		return this._tabType;
	}

	set tabType(tabType) {
		let success = this._handleDataChange("tabType", tabType);
		if (success === false) return;
		this._tabType = tabType;
	}
	
	connectedCallback() {
		super.connectedCallback();
		if (!this.render) {
			Zotero.warn("Pane section must have method render().");
		}
	}

	disconnectedCallback() {
		super.disconnectedCallback();
		if (this._section) {
			this._section.removeEventListener("toggle", this._handleSectionToggle);
			this._section = null;
		}
	}

	initCollapsibleSection() {
		this._section = this.querySelector('collapsible-section');
		if (this._section) {
			this._section.addEventListener("toggle", this._handleSectionToggle);
		}
	}

	/**
	 * @returns {boolean} if false, data change will not be saved
	 */
	_handleDataChange(_type, _value) {
		return true;
	}

	_handleSectionToggle = async (event) => {
		if (event.target !== this._section || !this._section.open) {
			return;
		}
		if (this.render) await this.render(true);
		if (this.secondaryRender) await this.secondaryRender(true);
	};

	/**
	 * @param {"primary" | "secondary"} [type]
	 * @returns {boolean}
	 */
	_isAlreadyRendered(type = "primary") {
		let key = `_${type}RenderItemID`;
		let cachedFlag = this[key];
		if (cachedFlag && this.item?.id == cachedFlag) {
			return true;
		}
		this[key] = this.item.id;
		return false;
	}
}

{
	class ItemPaneCustomSection extends ItemPaneSectionElementBase {
		_hooks = {};

		_sectionButtons = {};

		_refreshDisabled = true;

		get content() {
			let extraButtons = Object.keys(this._sectionButtons).join(",");
			let content = `
				<collapsible-section custom="true" data-pane="${this.paneID}" extra-buttons="${extraButtons}">
					<html:div data-type="body">
						${this.fragment || ""}
					</html:div>
				</collapsible-section>
				<html:style class="custom-style"></html:style>
			`;
			return MozXULElement.parseXULToFragment(content);
		}

		get paneID() {
			return this._paneID;
		}

		set paneID(paneID) {
			this._paneID = paneID;
			if (this.initialized) {
				this._section.dataset.pane = paneID;
				this.dataset.pane = paneID;
			}
		}

		get fragment() {
			return this._fragment;
		}

		/**
		 * @param {string} fragment
		 */
		set fragment(fragment) {
			this._fragment = fragment;
			if (this.initialized) {
				this._body.replaceChildren(
					document.importNode(MozXULElement.parseXULToFragment(fragment), true)
				);
			}
		}

		init() {
			this._section = this.querySelector("collapsible-section");
			this._body = this._section.querySelector('[data-type="body"]');
			this._style = this.querySelector(".custom-style");

			if (this.paneID) this.dataset.pane = this.paneID;
			if (this._label) this._section.label = this._label;
			this.updateSectionIcon();

			this._sectionListeners = [];

			let styles = [];
			for (let type of Object.keys(this._sectionButtons)) {
				let { icon, darkIcon, onClick } = this._sectionButtons[type];
				if (!darkIcon) {
					darkIcon = icon;
				}
				let listener = (event) => {
					let args = this._getHookArgs();
					args.event = event;
					onClick(args);
				};
				this._section.addEventListener(type, listener);
				this._sectionListeners.push({ type, listener });
				let button = this.querySelector(`.${type}`);
				button.style = `--custom-button-icon-light: url('${icon}'); --custom-button-icon-dark: url('${darkIcon}');`;
			}

			this._style.textContent = styles.join("\n");

			this._section.addEventListener("toggle", this._handleToggle);
			this._sectionListeners.push({ type: "toggle", listener: this._handleToggle });

			this.render = ["AsyncFunction", "GeneratorFunction"].includes(this._hooks.render.constructor.name)
				? this._handleRenderAsync
				: this._handleRenderSync;
			if (this._hooks.secondaryRender) this.secondaryRender = this._handleSecondaryRender;

			this._handleInit();

			// Disable refresh until data is load
			this._refreshDisabled = false;
		}

		destroy() {
			this._sectionListeners.forEach(data => this._section?.removeEventListener(data.type, data.listener));

			this._handleDestroy();
			this._hooks = null;
		}

		setL10nID(l10nId) {
			this._section.dataset.l10nId = l10nId;
		}

		setL10nArgs(l10nArgs) {
			this._section.dataset.l10nArgs = l10nArgs;
		}

		registerSectionIcon(options) {
			let { icon, darkIcon } = options;
			if (!darkIcon) {
				darkIcon = icon;
			}
			this._lightIcon = icon;
			this._darkIcon = darkIcon;
			if (this.initialized) {
				this.updateSectionIcon();
			}
		}

		updateSectionIcon() {
			this.style = `--custom-section-icon-light: url('${this._lightIcon}'); --custom-section-icon-dark: url('${this._darkIcon}')`;
		}

		registerSectionButton(options) {
			let { type, icon, darkIcon, onClick } = options;
			if (!darkIcon) {
				darkIcon = icon;
			}
			if (this.initialized) {
				Zotero.warn(`ItemPaneCustomSection section button cannot be registered after initialization`);
				return;
			}
			this._sectionButtons[type.replace(/[^a-zA-Z0-9-_]/g, "-")] = {
				icon, darkIcon, onClick
			};
		}

		/**
		 * @param {{ type: "render" | "secondaryRender" | "init" | "destroy" | "toggle" }} options
		 */
		registerHook(options) {
			let { type, callback } = options;
			if (!callback) return;
			this._hooks[type] = callback;
		}

		_getHookArgs() {
			return {
				paneID: this.paneID,
				doc: document,
				body: this._body,
				getData: () => {
					return {
						item: this.item,
						mode: this.mode,
						inTrash: this.inTrash,
						tabType: this.tabType,
					};
				},
				setL10nArgs: l10nArgs => this.setL10nArgs(l10nArgs),
				setEnabled: enabled => this.hidden = !enabled,
			};
		}

		_handleInit() {
			if (!this._hooks.init) return;
			let args = this._getHookArgs();
			// Expose refresh to plugins
			args.refresh = async () => this._handleRefresh();
			this._hooks.init(args);
		}

		_handleDestroy() {
			if (!this._hooks.destroy) return;
			let args = this._getHookArgs();
			delete args.getData;
			delete args.setL10nArgs;
			delete args.setEnabled;
			this._hooks.destroy(args);
		}

		_handleRenderSync() {
			if (!this.initialized || this._isAlreadyRendered()) return false;
			return this._hooks.render(this._getHookArgs());
		}

		async _handleRenderAsync() {
			if (!this.initialized || this._isAlreadyRendered()) return false;
			return this._hooks.render(this._getHookArgs());
		}

		async _handleSecondaryRender() {
			if (!this.initialized || this._isAlreadyRendered("secondary")) return false;
			return this._hooks.secondaryRender(this._getHookArgs());
		}

		async _handleRefresh() {
			if (!this.initialized) return;
			await this._hooks.render(this._getHookArgs());
			if (this._hooks.secondaryRender) await this._hooks.secondaryRender(this._getHookArgs());
		}

		_handleToggle = (event) => {
			if (this._hooks.toggle) {
				let args = this._getHookArgs();
				args.event = event;
				this._hooks.toggle(args);
			}
		};

		_handleDataChange(type, value) {
			if (this._hooks.dataChange) {
				let args = this._getHookArgs();
				args.incomingData = { type, value };
				return this._hooks.dataChange(args);
			}
			return true;
		}
	}

	customElements.define("item-pane-custom-section", ItemPaneCustomSection);
}
