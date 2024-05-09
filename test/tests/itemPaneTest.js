describe("Item pane", function () {
	var win, doc, ZoteroPane, Zotero_Tabs, ZoteroContextPane, itemsView;

	async function waitForPreviewBoxRender(box) {
		let success = await waitForCallback(
			() => box._asyncRenderItemID && !box._asyncRendering);
		if (!success) {
			Zotero.debug("Wait for box render time out");
		}
		await box._preview._renderDeferred?.promise;
		return success;
	}

	async function waitForPreviewBoxReader(box) {
		await waitForPreviewBoxRender(box);
		let success = await waitForCallback(
			() => box._preview._reader);
		if (!success) {
			Zotero.debug("Wait for box preview reader time out");
		}
		return success;
	}

	function isPreviewDisplayed(box) {
		return !!(box._preview.hasPreview
			&& win.getComputedStyle(box._preview).display !== "none");
	}
	
	before(function* () {
		win = yield loadZoteroPane();
		doc = win.document;
		ZoteroPane = win.ZoteroPane;
		Zotero_Tabs = win.Zotero_Tabs;
		ZoteroContextPane = win.ZoteroContextPane;
		itemsView = win.ZoteroPane.itemsView;
	});
	after(function () {
		win.close();
	});
	
	describe("Info pane", function () {
		it("should refresh on item update", function* () {
			var item = new Zotero.Item('book');
			var id = yield item.saveTx();
			
			var itemBox = doc.getElementById('zotero-editpane-item-box');
			var label = itemBox.querySelectorAll('[fieldname="series"]')[1];
			assert.equal(label.value, '');
			
			item.setField('series', 'Test');
			yield item.saveTx();
			
			label = itemBox.querySelectorAll('[fieldname="series"]')[1];
			assert.equal(label.value, 'Test');
			
			yield Zotero.Items.erase(id);
		});
		
		
		it("should swap creator names", async function () {
			var item = new Zotero.Item('book');
			item.setCreators([
				{
					firstName: "First",
					lastName: "Last",
					creatorType: "author"
				}
			]);
			await item.saveTx();
			
			var itemBox = doc.getElementById('zotero-editpane-item-box');
			var lastName = itemBox.querySelector('#itembox-field-value-creator-0-lastName');
			var parent = lastName.closest(".creator-type-value");
			assert.property(parent, 'oncontextmenu');
			assert.isFunction(parent.oncontextmenu);
			
			var menupopup = itemBox.querySelector('#zotero-creator-transform-menu');
			// Fake a right-click
			doc.popupNode = parent;
			menupopup.openPopup(
				parent, "after_start", 0, 0, true, false, new MouseEvent('click', { button: 2 })
			);
			var menuitem = menupopup.getElementsByTagName('menuitem')[0];
			menuitem.click();
			await waitForItemEvent('modify');
			
			var creator = item.getCreators()[0];
			assert.propertyVal(creator, 'firstName', 'Last');
			assert.propertyVal(creator, 'lastName', 'First');
		});
		
		
		it("shouldn't show Swap Names option for single-field mode", async function () {
			var item = new Zotero.Item('book');
			item.setCreators([
				{
					name: "Name",
					creatorType: "author"
				}
			]);
			await item.saveTx();
			
			var itemBox = doc.getElementById('zotero-editpane-item-box');
			var label = itemBox.querySelector('#itembox-field-value-creator-0-lastName');
			var firstlast = label.closest('.creator-type-value');
			firstlast.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 }));
			
			var menuitem = doc.getElementById('creator-transform-swap-names');
			assert.isTrue(menuitem.hidden);
		});

		it("should reorder creators", async function () {
			var item = new Zotero.Item('book');
			item.setCreators([
				{
					lastName: "One",
					creatorType: "author"
				},
				{
					lastName: "Two",
					creatorType: "author"
				},
				{
					lastName: "Three",
					creatorType: "author"
				}
			]);
			await item.saveTx();
			
			var itemBox = doc.getElementById('zotero-editpane-item-box');
			// Move One to the last spot
			itemBox.moveCreator(0, null, 3);
			await waitForItemEvent('modify');
			let thirdLastName = itemBox.querySelector("[fieldname='creator-2-lastName']").value;
			assert.equal(thirdLastName, "One");

			// Move One to the second spot
			itemBox.moveCreator(2, null, 1);
			await waitForItemEvent('modify');
			let secondLastname = itemBox.querySelector("[fieldname='creator-1-lastName']").value;
			assert.equal(secondLastname, "One");

			// Move Two down
			itemBox.moveCreator(0, 'down');
			await waitForItemEvent('modify');
			secondLastname = itemBox.querySelector("[fieldname='creator-1-lastName']").value;
			let firstLastName = itemBox.querySelector("[fieldname='creator-0-lastName']").value;
			assert.equal(secondLastname, "Two");
			assert.equal(firstLastName, "One");

			// Move Three up
			itemBox.moveCreator(2, 'up');
			await waitForItemEvent('modify');
			secondLastname = itemBox.querySelector("[fieldname='creator-1-lastName']").value;
			thirdLastName = itemBox.querySelector("[fieldname='creator-2-lastName']").value;
			assert.equal(secondLastname, "Three");
			assert.equal(thirdLastName, "Two");
		});
		
		
		// Note: This issue applies to all context menus in the item box (text transform, name swap),
		// though the others aren't tested. This might go away with the XUL->HTML transition.
		it.skip("should save open field after changing creator type", function* () {
			var item = new Zotero.Item('book');
			item.setCreators([
				{
					firstName: "First",
					lastName: "Last",
					creatorType: "author"
				}
			]);
			var id = yield item.saveTx();
			
			var itemBox = doc.getElementById('zotero-editpane-item-box');
			var label = itemBox.querySelector('[fieldname="place"]');
			label.click();
			var textbox = itemBox.querySelector('[fieldname="place"]');
			textbox.value = "Place";
			
			var menuLabel = itemBox.querySelector('[fieldname="creator-0-typeID"]');
			menuLabel.click();
			var menupopup = itemBox._creatorTypeMenu;
			var menuItems = menupopup.getElementsByTagName('menuitem');
			menuItems[1].click();
			yield waitForItemEvent('modify');
			
			assert.equal(item.getField('place'), 'Place');
			assert.equal(Zotero.CreatorTypes.getName(item.getCreators()[0].creatorTypeID), 'contributor');
			
			// Wait for no-op saveTx()
			yield Zotero.Promise.delay(1);
		});
		
		it("should accept 'now' for Accessed", async function () {
			var item = await createDataObject('item');
			
			var itemBox = doc.getElementById('zotero-editpane-item-box');
			var textbox = itemBox.querySelector('[fieldname="accessDate"]');
			textbox.value = 'now';
			// Blur events don't necessarily trigger if window doesn't have focus
			itemBox.hideEditor(textbox);
			
			await waitForItemEvent('modify');
			
			assert.approximately(
				Zotero.Date.sqlToDate(item.getField('accessDate'), true).getTime(),
				Date.now(),
				5000
			);
		});

		it("should persist fieldMode after hiding a creator name editor", async function () {
			let item = new Zotero.Item('book');
			item.setCreators([
				{
					name: "First Last",
					creatorType: "author",
					fieldMode: 1
				}
			]);
			await item.saveTx();
			
			let itemBox = doc.getElementById('zotero-editpane-item-box');

			itemBox.querySelector('[fieldname="creator-0-lastName"]').click();
			itemBox.hideEditor(itemBox.querySelector('input[fieldname="creator-0-lastName"]'));
			
			assert.equal(
				itemBox.querySelector('[fieldname="creator-0-lastName"]').getAttribute('fieldMode'),
				'1'
			);
		});
	});
	
	describe("Attachment pane", function () {
		let paneID = "attachment-info";

		it("should refresh on file rename", async function () {
			let file = getTestDataDirectory();
			file.append('test.png');
			let item = await Zotero.Attachments.importFromFile({
				file: file
			});
			let newName = 'test2.png';

			let itemBox = doc.getElementById('zotero-attachment-box');
			let label = itemBox._id('fileName');
			let promise = waitForDOMAttributes(label, 'value', (newValue) => {
				return newValue === newName;
			});

			await item.renameAttachmentFile(newName);
			
			await promise;
			assert.equal(label.value, newName);
		});
		
		it("should update on attachment title change", async function () {
			let file = getTestDataDirectory();
			file.append('test.png');
			let item = await Zotero.Attachments.importFromFile({ file });
			let newTitle = 'New Title';

			let paneHeader = doc.getElementById('zotero-item-pane-header');
			let label = paneHeader.titleField;
			let promise = waitForDOMAttributes(label, 'value', (newValue) => {
				return newValue === newTitle;
			});

			item.setField('title', newTitle);
			await item.saveTx();
			
			await promise;
			assert.equal(label.value, newTitle);
		});

		it("should show attachment pane in library for attachment item", async function () {
			// Regular item: hide
			let itemDetails = ZoteroPane.itemPane._itemDetails;
			let box = itemDetails.getPane(paneID);
			let item = new Zotero.Item('book');
			await item.saveTx();
			await ZoteroPane.selectItem(item.id);
			await waitForScrollToPane(itemDetails, paneID);
			assert.isTrue(box.hidden);

			// Child attachment: show
			let file = getTestDataDirectory();
			file.append('test.pdf');
			let attachment = await Zotero.Attachments.importFromFile({
				file,
				parentItemID: item.id
			});
			await ZoteroPane.selectItem(attachment.id);
			await waitForScrollToPane(itemDetails, paneID);
			await waitForPreviewBoxReader(box);
			assert.isFalse(box.hidden);
			assert.isTrue(isPreviewDisplayed(box));

			// Standalone attachment: show
			let attachment1 = await importFileAttachment('test.pdf');
			await ZoteroPane.selectItem(attachment1.id);
			await waitForScrollToPane(itemDetails, paneID);
			await waitForPreviewBoxReader(box);
			assert.isFalse(box.hidden);
			assert.isTrue(isPreviewDisplayed(box));
		});

		it("should show attachment pane without preview in reader for standalone attachment item", async function () {
			// Attachment item with parent item: hide
			let item = new Zotero.Item('book');
			let file = getTestDataDirectory();
			file.append('test.pdf');
			await item.saveTx();
			let attachment = await Zotero.Attachments.importFromFile({
				file,
				parentItemID: item.id
			});
			await ZoteroPane.viewItems([attachment]);
			let tabID = Zotero_Tabs.selectedID;
			let itemDetails = ZoteroContextPane.context._getItemContext(tabID);
			let box = itemDetails.getPane(paneID);
			assert.isTrue(box.hidden);

			// Standalone attachment item: show
			attachment = await importFileAttachment('test.pdf');
			await ZoteroPane.viewItems([attachment]);
			tabID = Zotero_Tabs.selectedID;
			itemDetails = ZoteroContextPane.context._getItemContext(tabID);
			box = itemDetails.getPane(paneID);
			assert.isFalse(box.hidden);

			await waitForScrollToPane(itemDetails, paneID);
			// No preview
			assert.isFalse(isPreviewDisplayed(box));
		});

		it("should only show attachment note container when exists", async function () {
			let itemDetails = ZoteroPane.itemPane._itemDetails;
			let box = itemDetails.getPane(paneID);
			let noteContainer = box._id("note-container");
			let noteEditor = box._id('attachment-note-editor');

			// Hide note container by default
			let attachment = await importFileAttachment('test.pdf');
			await ZoteroPane.selectItem(attachment.id);
			await itemDetails._renderDeferred.promise;
			await waitForScrollToPane(itemDetails, paneID);
			await waitForPreviewBoxRender(box);
			assert.isTrue(noteContainer.hidden);

			// Add attachment note
			let itemModifyPromise = waitForItemEvent("modify");
			attachment.setNote("<h1>TEST</h1>");
			await attachment.saveTx();
			await itemModifyPromise;
			await waitForPreviewBoxRender(box);
			// Should show note container
			assert.isFalse(noteContainer.hidden);
			// Should be readonly
			assert.equal(noteEditor.mode, "view");
		});
	});
	
	
	describe("Note editor", function () {
		it("should refresh on note update", function* () {
			var item = new Zotero.Item('note');
			var id = yield item.saveTx();
			
			var noteEditor = doc.getElementById('zotero-note-editor');
			
			// Wait for the editor
			yield new Zotero.Promise((resolve, reject) => {
				noteEditor.onInit(() => resolve());
			});
			assert.equal(noteEditor._editorInstance._iframeWindow.wrappedJSObject.getDataSync(), null);
			item.setNote('<p>Test</p>');
			yield item.saveTx();
			
			// Wait for asynchronous editor update
			do {
				yield Zotero.Promise.delay(10);
			} while (
				!/<div data-schema-version=".*"><p>Test<\/p><\/div>/.test(
					noteEditor._editorInstance._iframeWindow.wrappedJSObject.getDataSync().html.replace(/\n/g, '')
				)
			);
		});
	});
	
	describe("Feed buttons", function() {
		describe("Mark as Read/Unread", function() {
			it("should update label when state of an item changes", function* () {
				let feed = yield createFeed();
				yield selectLibrary(win, feed.libraryID);
				yield waitForItemsLoad(win);
				
				var stub = sinon.stub(win.ZoteroPane, 'startItemReadTimeout');
				var item = yield createDataObject('feedItem', { libraryID: feed.libraryID });
				// Skip timed mark-as-read
				assert.ok(stub.called);
				stub.restore();
				item.isRead = true;
				yield item.saveTx();
				
				let button = doc.getElementById('zotero-feed-item-toggleRead-button');
				
				assert.equal(button.label, Zotero.getString('pane.item.markAsUnread'));
				yield item.toggleRead(false);
				// Button is re-created
				button = doc.getElementById('zotero-feed-item-toggleRead-button');
				assert.equal(button.label, Zotero.getString('pane.item.markAsRead'));
			});
		});
	});
	
	describe("Duplicates Merge pane", function () {
		// Same as test in itemsTest, but via UI, which makes a copy via toJSON()/fromJSON()
		it("should transfer merge-tracking relations when merging two pairs into one item", async function () {
			var item1 = await createDataObject('item', { title: 'A' });
			var item2 = await createDataObject('item', { title: 'B' });
			var item3 = await createDataObject('item', { title: 'C' });
			var item4 = await createDataObject('item', { title: 'D' });
			
			var uris = [item2, item3, item4].map(item => Zotero.URI.getItemURI(item));
			
			var p;
			
			var zp = win.ZoteroPane;
			await zp.selectItems([item1.id, item2.id]);
			zp.mergeSelectedItems();
			p = waitForItemEvent('modify');
			doc.getElementById('zotero-duplicates-merge-button').click();
			await p;
			
			assert.sameMembers(
				item1.getRelations()[Zotero.Relations.replacedItemPredicate],
				[uris[0]]
			);
			
			await zp.selectItems([item3.id, item4.id]);
			zp.mergeSelectedItems();
			p = waitForItemEvent('modify');
			doc.getElementById('zotero-duplicates-merge-button').click();
			await p;
			
			assert.sameMembers(
				item3.getRelations()[Zotero.Relations.replacedItemPredicate],
				[uris[2]]
			);
			
			await zp.selectItems([item1.id, item3.id]);
			zp.mergeSelectedItems();
			p = waitForItemEvent('modify');
			doc.getElementById('zotero-duplicates-merge-button').click();
			await p;
			
			// Remaining item should include all other URIs
			assert.sameMembers(
				item1.getRelations()[Zotero.Relations.replacedItemPredicate],
				uris
			);
		});
	});
});
