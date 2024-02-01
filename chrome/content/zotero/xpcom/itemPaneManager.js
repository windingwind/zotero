/*
	***** BEGIN LICENSE BLOCK *****

	Copyright © 2024 Corporation for Digital Scholarship
					 Vienna, Virginia, USA
					 https://digitalscholar.org

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


/**
 * @typedef SectionIcon
 * @type {object}
 * @property {string} icon - Icon URI
 * @property {string} [darkIcon] - Icon URI in dark mode. If not set, use `icon`
 * @typedef SectionL10n
 * @type {object}
 * @property {string} l10nID - data-l10n-id for localization
 * @property {string} [l10nArgs] - data-l10n-args for localization
 * @typedef SectionButton
 * @type {object}
 * @property {string} type - Button type, must be valid DOMString and without ","
 * @property {(options: SectionEventHookArgs) => void} onClick - Button click callback
 * @typedef SectionHookArgs
 * @type {object}
 * @property {string} paneID - Registered pane id
 * @property {Document} doc - Document of section
 * @property {HTMLDivElement} body - Section body
 * @property {() => {item: Zotero.Item, mode: string, inTrash: boolean, tabType: string}} getData - Get section data
 * @property {(l10nArgs: string) => void} setL10nArgs - Set l10n args for section header
 * @property {(l10nArgs: string) => void} setEnabled - Set pane enabled state
 * @typedef  {SectionHookArgs & { refresh: () => Promise<void> }} SectionInitHookArgs
 * A `refresh` is exposed to plugins to allows plugins to refresh the section when necessary,
 * e.g. item modify notifier callback. Note that calling `refresh` during initialization
 * have no effect.
 * @typedef  {SectionHookArgs & { incomingData: { type: "item" | "mode" | "inTrash" | "tabType", value: any } }} SectionDataChangeHookArgs
 * @typedef  {Omit<SectionHookArgs, "getData" | "setL10nArgs" | "setEnabled">} SectionDestroyHookArgs
 * @typedef  {SectionHookArgs & { event: Event }} SectionEventHookArgs
 * @typedef ItemDetailsSectionOptions
 * @type {object}
 * @property {string} paneID - Unique pane ID
 * @property {string} pluginID - Set plugin ID to auto remove section when plugin is disabled/removed
 * @property {SectionL10n & SectionIcon} head - Header options. Icon should be 16*16 and `label` need to be localized
 * @property {SectionL10n & SectionIcon} sidenav - Sidenav options. Icon should be 20*20 and `tooltiptext` need to be localized
 * @property {string} [fragment] - Pane fragment as string
 * @property {(options: SectionInitHookArgs) => void} [onInit]
 * Lifecycle hook called when section is initialized
 *
 * Do:
 * 1. Initialize data if necessary
 * 2. Setup hooks, e.g. notifier callback
 *
 * NOT do:
 * 1. Render/refresh UI
 * @property {(options: SectionDestroyHookArgs) => void} [onDestroy]
 * Lifecycle hook called when section is destroyed
 *
 * Do:
 * 1. Remove data and release resource
 * 2. Remove hooks, e.g. notifier callback
 *
 * NOT do:
 * 1. Render/refresh UI
 * @property {(options: SectionDataChangeHookArgs) => boolean} [onDataChange]
 * Lifecycle hook called when section incoming data change received
 *
 * Return `false` to abort the data change, otherwise the data change will be applied
 * (stored internally and can be accessed by `options.getData` in other hooks).
 *
 * Do:
 * 1. Validate and decide whether to accept the incoming data change
 * 2. Update the section enabled state with `options.setEnabled`. For example, if the section
 *   is only enabled in the readers, you can use:
 * ```js
 * onDataChange(options) {
 *   let { incomingData, setEnabled } = options.;
 *   if (incomingData.type === "tabType") {
 *     setEnabled(incomingData.value === "reader");
 *   }
 *   return true;
 * }
 * ```
 * options.setEnabled(options.tabType === "reader");
 *
 * NOT do:
 * 1. Render/refresh UI
 * @property {(options: SectionHookArgs) => void | Promise<void>} onRender
 * Lifecycle hook called when section should do primary render
 *
 * Create elements and append them to `options.body`.
 * - If `onRender` is sync, it is always called when the item pane is rendered;
 * - If `onRender` is async, it will be called when scrolling into view.
 *
 * If the rendering can be slow, you should either make it async, or move async part to `onSecondaryRender`.
 *
 * > Note that the rendering of section is fully controlled by Zotero to minimize resource usage.
 * > Only render UI things when you are told to.
 * @property {(options: SectionHookArgs) => void | Promise<void>} [onSecondaryRender]
 * [Optional] Lifecycle hook called when section should do secondary render
 *
 * The best practice to time-consuming rendering with runtime decided section height is:
 * 1. Compute height and create a box in sync `onRender`;
 * 2. Render actual contents in async `onSecondaryRender`.
 * @property {(options: SectionEventHookArgs) => void} [onToggle] - Called when section is toggled
 * @property {SectionButton[]} [sectionButtons] - Section button options
 */


class ItemPaneManager {
	_customSections = {};

	_lastUpdateTime = 0;

	/**
	 * Register a custom section in item pane. All registered sections must be valid, and must have a unique paneID.
	 * @param {ItemDetailsSectionOptions | ItemDetailsSectionOptions[]} options - section data
	 * @returns {string | string[] | false} - The paneID or false if no section were added
	 */
	registerSections(options) {
		let registeredIDs = this._addSections(options);
		if (!registeredIDs) {
			return false;
		}
		this._addPluginShutdownObserver();
		this._notifyItemPane();
		return registeredIDs;
	}

	/**
	 * Unregister a custom column.
	 * @param {string | string[]} paneIDs - The paneID of the section(s) to unregister
	 * @returns {boolean} true if the column(s) are unregistered
	 */
	unregisterSections(paneIDs) {
		const success = this._removeSections(paneIDs);
		if (!success) {
			return false;
		}
		this._notifyItemPane();
		return true;
	}

	getUpdateTime() {
		return this._lastUpdateTime;
	}

	/**
	 * @returns {ItemDetailsSectionOptions[]}
	 */
	getCustomSections() {
		return Object.values(this._customSections).map(opt => Object.assign({}, opt));
	}

	/**
	 * @param {ItemDetailsSectionOptions | ItemDetailsSectionOptions[]} options
	 * @returns {string | string[] | false}
	 */
	_addSections(options) {
		const isSingle = !Array.isArray(options);
		if (isSingle) {
			options = [options];
		}
		options = options.map(o => Object.assign({}, o));
		options.forEach((o) => {
			o.paneID = this._namespacedDataKey(o);
		});
		if (!this._validateSectionOptions(options)) {
			return false;
		}
		for (let opt of options) {
			this._customSections[opt.paneID] = opt;
		}
		return isSingle ? options[0].paneID : options.map(opt => opt.paneID);
	}

	_removeSections(paneIDs) {
		if (!Array.isArray(paneIDs)) {
			paneIDs = [paneIDs];
		}
		// If any check fails, return check results and do not remove any section
		for (const id of paneIDs) {
			if (!this._customSections[id]) {
				Zotero.warn(`ItemPaneManager section option with paneID ${id} does not exist.`);
				return false;
			}
		}
		for (const id of paneIDs) {
			delete this._customSections[id];
		}
		return true;
	}

	/**
	 * @param {ItemDetailsSectionOptions[]} options
	 * @returns {boolean}
	 */
	_validateSectionOptions(options) {
		const noInputDuplicates = !options.find((opt, i, arr) => arr.findIndex(o => o.paneID === opt.paneID) !== i);
		if (!noInputDuplicates) {
			Zotero.warn(`ItemPaneManager section options have duplicate paneID`);
			return false;
		}

		let requiredParamsType = {
			paneID: "string",
			pluginID: "string",
			head: (val) => {
				if (typeof val != "object") {
					return "ItemPaneManager section options head must be object";
				}
				if (!val.l10nID || typeof val.l10nID != "string") {
					return "ItemPaneManager section options head l10nID must be non-empty string";
				}
				if (!val.icon || typeof val.icon != "string") {
					return "ItemPaneManager section options head icon must be non-empty string";
				}
				return true;
			},
			sidenav: (val) => {
				if (typeof val != "object") {
					return "ItemPaneManager section options sidenav must be object";
				}
				if (!val.l10nID || typeof val.l10nID != "string") {
					return "ItemPaneManager section options sidenav l10nID must be non-empty string";
				}
				if (!val.icon || typeof val.icon != "string") {
					return "ItemPaneManager section options sidenav icon must be non-empty string";
				}
				return true;
			},
			onRender: "function",
		};
		// Keep in sync with itemDetails.js
		let builtInPaneIDs = [
			"info",
			"abstract",
			"attachments",
			"notes",
			"attachment-info",
			"attachment-annotations",
			"libraries-collections",
			"tags",
			"related"
		];
		for (let opt of options) {
			for (let key of Object.keys(requiredParamsType)) {
				let val = opt[key];
				if (!val) {
					Zotero.warn(`ItemPaneManager section option must have ${key}`);
					return false;
				}
				let requiredType = requiredParamsType[key];
				if (typeof requiredType == "string" && typeof val != requiredType) {
					Zotero.warn(`ItemPaneManager section option ${key} must be ${requiredType}, but got ${typeof val}`);
					return false;
				}
				if (typeof requiredType == "function") {
					let result = requiredType(val);
					if (result !== true) {
						Zotero.warn(result);
						return false;
					}
				}
			}
			if (builtInPaneIDs.includes(opt.paneID)) {
				Zotero.warn(`ItemPaneManager section option paneID must not conflict with built-in paneID, but got ${opt.paneID}`);
				return false;
			}
			if (this._customSections[opt.paneID]) {
				Zotero.warn(`ItemPaneManager section option paneID must be unique, but got ${opt.paneID}`);
				return false;
			}
		}
		
		return true;
	}

	/**
	 * Make sure the dataKey is namespaced with the plugin ID
	 * @param {ItemDetailsSectionOptions} options
	 * @returns {string}
	 */
	_namespacedDataKey(options) {
		if (options.pluginID && options.paneID) {
			// Make sure the return value is valid as class name or element id
			return `${options.pluginID}-${options.paneID}`.replace(/[^a-zA-Z0-9-_]/g, "-");
		}
		return options.paneID;
	}

	async _notifyItemPane() {
		this._lastUpdateTime = new Date().getTime();
		await Zotero.DB.executeTransaction(async function () {
			Zotero.Notifier.queue(
				'refresh',
				'itempane',
				[],
				{},
			);
		});
	}

	/**
	 * Unregister all columns registered by a plugin
	 * @param {string} pluginID - Plugin ID
	 */
	async _unregisterSectionByPluginID(pluginID) {
		let paneIDs = Object.keys(this._customSections).filter(id => this._customSections[id].pluginID == pluginID);
		if (paneIDs.length === 0) {
			return;
		}
		// Remove the columns one by one
		// This is to ensure that the columns are removed and not interrupted by any non-existing columns
		paneIDs.forEach(id => this._removeSections(id));
		Zotero.debug(`ItemPaneManager sections registered by plugin ${pluginID} unregistered due to shutdown`);
		await this._notifyItemPane();
	}

	/**
	 * Ensure that the shutdown observer is added
	 * @returns {void}
	 */
	_addPluginShutdownObserver() {
		if (this._observerAdded) {
			return;
		}

		Zotero.Plugins.addObserver({
			shutdown: ({ id: pluginID }) => {
				this._unregisterSectionByPluginID(pluginID);
			}
		});
		this._observerAdded = true;
	}
}

Zotero.ItemPaneManager = new ItemPaneManager();
