/* globals XPCOMUtils, NetUtil, PlacesUtils, btoa, Bookmarks */
"use strict";

const {before} = require("sdk/test/utils");
const {PlacesProvider} = require("lib/PlacesProvider");
const {PlacesTestUtils} = require("./lib/PlacesTestUtils");
const {Ci, Cu} = require("chrome");
const systemEvents = require("sdk/system/events");

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.importGlobalProperties(["btoa"]);

XPCOMUtils.defineLazyModuleGetter(this, "PlacesUtils",
                                  "resource://gre/modules/PlacesUtils.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "NetUtil",
                                  "resource://gre/modules/NetUtil.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "Bookmarks",
                                  "resource://gre/modules/Bookmarks.jsm");

// use time at the start of the tests, chnaging it inside timeDaysAgo()
// may cause tiny time differences, which break expected sql ordering
const TIME_NOW = (new Date()).getTime();

// utility function to compute past timestamp
function timeDaysAgo(numDays) {
  return TIME_NOW - (numDays * 24 * 60 * 60 * 1000);
}

exports.test_LinkChecker_securityCheck = function(assert) {
  let urls = [
    {url: "file://home/file/image.png", expected: false},
    {url: "resource:///modules/PlacesProvider.jsm", expected: false},
    {url: "javascript:alert('hello')", expected: false}, // jshint ignore:line
    {url: "data:image/png;base64,XXX", expected: false},
    {url: "about:newtab", expected: true},
    {url: "https://example.com", expected: true},
    {url: "ftp://example.com", expected: true},
  ];
  for (let {url, expected} of urls) {
    let observed = PlacesProvider.LinkChecker.checkLoadURI(url);
    assert.equal(observed, expected, `can load "${url}"?`);
  }
};

exports.test_Links_getTopFrecentSites = function*(assert) {
  let provider = PlacesProvider.links;

  let links = yield provider.getTopFrecentSites();
  assert.equal(links.length, 0, "empty history yields empty links");

  // add a visit
  let testURI = NetUtil.newURI("http://mozilla.com");
  yield PlacesTestUtils.addVisits(testURI);

  links = yield provider.getTopFrecentSites();
  assert.equal(links.length, 1, "adding a visit yields a link");
  assert.equal(links[0].url, testURI.spec, "added visit corresponds to added url");
};

exports.test_Links_getTopFrecentSites_Order = function*(assert) {
  let provider = PlacesProvider.links;
  let {
    TRANSITION_TYPED,
    TRANSITION_LINK
  } = PlacesUtils.history;

  let timeEarlier = timeDaysAgo(0);
  let timeLater = timeDaysAgo(2);

  let visits = [
    // frecency 200
    {uri: NetUtil.newURI("https://mozilla1.com/0"), visitDate: timeEarlier, transition: TRANSITION_TYPED},
    // sort by url, frecency 200
    {uri: NetUtil.newURI("https://mozilla2.com/1"), visitDate: timeEarlier, transition: TRANSITION_TYPED},
    // sort by last visit date, frecency 200
    {uri: NetUtil.newURI("https://mozilla3.com/2"), visitDate: timeLater, transition: TRANSITION_TYPED},
    // sort by frecency, frecency 10
    {uri: NetUtil.newURI("https://mozilla4.com/3"), visitDate: timeLater, transition: TRANSITION_LINK},
  ];

  let links = yield provider.getTopFrecentSites();
  assert.equal(links.length, 0, "empty history yields empty links");

  let base64URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAA" +
    "AAAA6fptVAAAACklEQVQI12NgAAAAAgAB4iG8MwAAAABJRU5ErkJggg==";

  let faviconData = {
    "https://mozilla1.com/0": null,
    "https://mozilla2.com/1": null,
    "https://mozilla3.com/2": base64URL,
    "https://mozilla4.com/3": null
  };
  yield PlacesTestUtils.addVisits(visits);
  yield PlacesTestUtils.addFavicons(faviconData);

  links = yield provider.getTopFrecentSites();
  assert.equal(links.length, visits.length, "number of links added is the same as obtain by getTopFrecentSites");

  for (let i = 0; i < links.length; i++) {
    assert.equal(links[i].url, visits[i].uri.spec, "links are obtained in the expected order");
    assert.equal(faviconData[links[i].url], links[i].favicon, "favicon data is stored as expected");
  }
};

exports.test_Links_getRecentLinks = function*(assert) {
  let provider = PlacesProvider.links;
  let {
    TRANSITION_TYPED,
    TRANSITION_LINK
  } = PlacesUtils.history;

  let visits = [
    // frecency 200
    {uri: NetUtil.newURI("https://mozilla1.com/0"), visitDate: timeDaysAgo(1), transition: TRANSITION_TYPED},
    // sort by url, frecency 200
    {uri: NetUtil.newURI("https://mozilla2.com/1"), visitDate: timeDaysAgo(0), transition: TRANSITION_TYPED},
    // sort by last visit date, frecency 200
    {uri: NetUtil.newURI("https://mozilla3.com/2"), visitDate: timeDaysAgo(2), transition: TRANSITION_TYPED},
    // sort by frecency, frecency 10
    {uri: NetUtil.newURI("https://mozilla4.com/3"), visitDate: timeDaysAgo(2), transition: TRANSITION_LINK},
  ];

  let links = yield provider.getRecentLinks();
  assert.equal(links.length, 0, "empty history yields empty links");

  let base64URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAA" +
    "AAAA6fptVAAAACklEQVQI12NgAAAAAgAB4iG8MwAAAABJRU5ErkJggg==";

  let faviconData = {
    "https://mozilla1.com/0": null,
    "https://mozilla2.com/1": null,
    "https://mozilla3.com/2": base64URL,
    "https://mozilla4.com/3": null
  };
  yield PlacesTestUtils.addVisits(visits, faviconData);
  yield PlacesTestUtils.addFavicons(faviconData);

  links = yield provider.getRecentLinks();
  assert.equal(links.length, visits.length, "number of links added is the same as obtain by getRecentLinks");
  assert.equal(links[0].url, "https://mozilla2.com/1", "Expected 1-st link");
  assert.equal(links[1].url, "https://mozilla1.com/0", "Expected 2-nd link");
  assert.equal(links[2].url, "https://mozilla3.com/2", "Expected 3-rd link");
  assert.equal(links[3].url, "https://mozilla4.com/3", "Expected 4-th link");
  assert.equal(faviconData[links[2].url], links[2].favicon, "favicon data is stored as expected");
};

exports.test_Links_getRecentBookmarks_Order = function*(assert) {
  let provider = PlacesProvider.links;
  let {
    TRANSITION_TYPED,
    TRANSITION_LINK
  } = PlacesUtils.history;
  provider.init();

  /** start setup **/
  let timeEarlier = timeDaysAgo(0);
  let timeLater = timeDaysAgo(2);

  let visits = [
    // frecency 200
    {uri: NetUtil.newURI("https://mozilla1.com/0"), visitDate: timeEarlier, transition: TRANSITION_TYPED},
    // sort by url, frecency 200
    {uri: NetUtil.newURI("https://mozilla2.com/1"), visitDate: timeEarlier, transition: TRANSITION_TYPED},
    // sort by last visit date, frecency 200
    {uri: NetUtil.newURI("https://mozilla3.com/2"), visitDate: timeLater, transition: TRANSITION_TYPED},
    // sort by frecency, frecency 10
    {uri: NetUtil.newURI("https://mozilla4.com/3"), visitDate: timeLater, transition: TRANSITION_LINK},
  ];

  let bookmarks = [
    {url: "https://mozilla1.com/0", parentGuid: "root________", type: Bookmarks.TYPE_BOOKMARK},
    {url: "https://mozilla1.com/1", parentGuid: "root________", type: Bookmarks.TYPE_BOOKMARK},
    {url: "https://mozilla1.com/2", parentGuid: "root________", type: Bookmarks.TYPE_BOOKMARK},
  ];

  let bookmarkURLSet = new Set(bookmarks.map(bm => bm.url));

  let links = yield provider.getRecentBookmarks();
  assert.equal(links.length, 0, "empty bookmarks yields empty links");

  let base64URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAA" +
    "AAAA6fptVAAAACklEQVQI12NgAAAAAgAB4iG8MwAAAABJRU5ErkJggg==";

  let faviconData = {
    "https://mozilla1.com/0": null,
    "https://mozilla2.com/1": null,
    "https://mozilla3.com/2": base64URL,
  };
  yield PlacesTestUtils.addVisits(visits);
  yield PlacesTestUtils.addFavicons(faviconData);
  /** end setup **/

  let bookmarkNotificationPromise = new Promise((resolve, reject) => {
    let addCount = 0;
    let newBookmarks = [];
    function handleEvent(eventName, data) {
      if (!bookmarkURLSet.has(data.url)) {
        reject();
      }
      addCount++;
      newBookmarks.push(data);
      if (bookmarks.length === addCount) {
        provider.off("bookmarkAdded", handleEvent);
        resolve(newBookmarks);
      }
    }
    provider.on("bookmarkAdded", handleEvent);
  });

  let folderInfo = {parentGuid: "root________", title: "A FOLDER", type: Bookmarks.TYPE_FOLDER};
  let folder = yield Bookmarks.insert(folderInfo);

  for (let placeInfo of bookmarks) {
    yield Bookmarks.insert(placeInfo);
  }
  let createdBookmarks = yield bookmarkNotificationPromise;

  /**
   * modify lastModified for bookmarks to ensure order
   * is from most recent to least recent.
   * Synchronous!
   */
  let modifiedTime = timeDaysAgo(0) * 1000;
  let conn = PlacesUtils.history.QueryInterface(Ci.nsPIPlacesDatabase).DBConnection;
  for (let bm of createdBookmarks) {
    // we change the modified date based on creation dates, because due to asynchronicity, we don't know what got created first
    let stmt = conn.createStatement(`UPDATE moz_bookmarks SET lastModified = ${modifiedTime} WHERE guid = "${bm.bookmarkGuid}"`);
    stmt.executeStep();
    modifiedTime -= (24 * 60 * 60);
  }

  links = yield provider.getRecentBookmarks();
  assert.equal(links.length, createdBookmarks.length, "number of bookmarks added is the same as obtain by getRecentBookmarks");

  for (let i = 0; i < links.length; i++) {
    assert.equal(links[i].url, createdBookmarks[i].url, "links are obtained in the expected order");
    assert.equal(faviconData[links[i].url], links[i].favicon, "favicon data is stored as expected");
  }

  // cleanup
  yield Bookmarks.remove({guid: folder.guid});
  provider.uninit();
};

exports.test_Links_bookmark_notifications = function*(assert) {
  let provider = PlacesProvider.links;
  let {
    TRANSITION_TYPED,
    TRANSITION_LINK
  } = PlacesUtils.history;
  provider.init();

  /** start setup **/
  let timeEarlier = timeDaysAgo(0);
  let timeLater = timeDaysAgo(2);

  let visits = [
    // frecency 200
    {uri: NetUtil.newURI("https://mozilla1.com/0"), visitDate: timeEarlier, transition: TRANSITION_TYPED},
    // sort by url, frecency 200
    {uri: NetUtil.newURI("https://mozilla2.com/1"), visitDate: timeEarlier, transition: TRANSITION_TYPED},
    // sort by last visit date, frecency 200
    {uri: NetUtil.newURI("https://mozilla3.com/2"), visitDate: timeLater, transition: TRANSITION_TYPED},
    // sort by frecency, frecency 10
    {uri: NetUtil.newURI("https://mozilla4.com/3"), visitDate: timeLater, transition: TRANSITION_LINK},
  ];

  let bookmarks = [
    {url: "https://mozilla1.com/0", parentGuid: "root________", type: Bookmarks.TYPE_BOOKMARK},
    {url: "https://mozilla1.com/1", parentGuid: "root________", type: Bookmarks.TYPE_BOOKMARK},
    {url: "https://mozilla1.com/2", parentGuid: "root________", type: Bookmarks.TYPE_BOOKMARK},
  ];

  let links = yield provider.getRecentBookmarks();
  assert.equal(links.length, 0, "empty bookmarks yields empty links");

  let base64URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAA" +
    "AAAA6fptVAAAACklEQVQI12NgAAAAAgAB4iG8MwAAAABJRU5ErkJggg==";

  let faviconData = {
    "https://mozilla1.com/0": null,
    "https://mozilla2.com/1": null,
    "https://mozilla3.com/2": base64URL,
  };
  yield PlacesTestUtils.addVisits(visits);
  yield PlacesTestUtils.addFavicons(faviconData);
  /** end setup **/

  let bookmarkNotificationPromise;

  bookmarkNotificationPromise = new Promise(resolve => {
    let addCount = 0;
    let newBookmarks = [];
    function handleEvent(eventName, data) {
      addCount++;
      newBookmarks.push(data);
      if (bookmarks.length === addCount) {
        provider.off("bookmarkAdded", handleEvent);
        resolve(newBookmarks);
      }
    }
    provider.on("bookmarkAdded", handleEvent);
  });

  // inserting a folder here, we are testing if this causes a notification, which it shouldn't
  let folderInfo = {parentGuid: "root________", title: "A FOLDER", type: Bookmarks.TYPE_FOLDER};
  let folder = yield Bookmarks.insert(folderInfo);

  for (let placeInfo of bookmarks) {
    yield Bookmarks.insert(placeInfo);
  }
  let createdBookmarks = yield bookmarkNotificationPromise;

  bookmarkNotificationPromise = new Promise(resolve => {
    function handleEvent(eventName, data) {
      if (data.bookmarkTitle === "FOO") {
        resolve(data);
      }
    }
    provider.once("bookmarkChanged", handleEvent);
  });
  let bm = createdBookmarks[0];
  Bookmarks.update({guid: bm.bookmarkGuid, title: "FOO"});
  yield bookmarkNotificationPromise;

  bookmarkNotificationPromise = new Promise(resolve => {
    function handleEvent(eventName, data) {
      if (data.url === bm.url) {
        resolve(data);
      }
    }
    provider.once("bookmarkRemoved", handleEvent);
  });
  yield Bookmarks.remove({guid: bm.bookmarkGuid});
  yield bookmarkNotificationPromise;

  // cleanup
  yield Bookmarks.remove({guid: folder.guid});
  provider.uninit();
};

exports.test_Links_onLinkChanged = function*(assert) {
  let provider = PlacesProvider.links;
  provider.init();
  assert.equal(true, true);

  let url = "https://example.com/onFrecencyChanged1";
  let linkChangedMsgCount = 0;

  let linkChangedPromise = new Promise(resolve => {
    let handler = (_, link) => { // jshint ignore:line
      /* There are 3 linkChanged events:
       * 1. visit insertion (-1 frecency by default)
       * 2. frecency score update (after transition type calculation etc)
       * 3. title change
       */
      if (link.url === url) {
        assert.equal(link.url, url, `expected url on linkChanged event`);
        linkChangedMsgCount += 1;
        if (linkChangedMsgCount === 3) {
          assert.ok(true, `all linkChanged events captured`);
          provider.off("linkChanged", this);
          resolve();
        }
      }
    };
    provider.on("linkChanged", handler);
  });

  // add a visit
  let testURI = NetUtil.newURI(url);
  yield PlacesTestUtils.addVisits(testURI);
  yield linkChangedPromise;

  provider.uninit();
};

exports.test_Links_onClearHistory = function*(assert) {
  let provider = PlacesProvider.links;
  provider.init();

  let clearHistoryPromise = new Promise(resolve => {
    let handler = () => {
      assert.ok(true, `clearHistory event captured`);
      provider.off("clearHistory", handler);
      resolve();
    };
    provider.on("clearHistory", handler);
  });

  // add visits
  for (let i = 0; i <= 10; i++) {
    let url = `https://example.com/onClearHistory${i}`;
    let testURI = NetUtil.newURI(url);
    yield PlacesTestUtils.addVisits(testURI);
  }
  yield PlacesTestUtils.clearHistory();
  yield clearHistoryPromise;
  provider.uninit();
};

exports.test_Links_onDeleteURI = function*(assert) {
  let provider = PlacesProvider.links;
  provider.init();

  let testURL = "https://example.com/toDelete";

  let deleteURIPromise = new Promise(resolve => {
    let handler = (_, {url}) => { // jshint ignore:line
      assert.equal(testURL, url, "deleted url and expected url are the same");
      provider.off("deleteURI", handler);
      resolve();
    };

    provider.on("deleteURI", handler);
  });

  let testURI = NetUtil.newURI(testURL);
  yield PlacesTestUtils.addVisits(testURI);
  yield PlacesUtils.history.remove(testURL);
  yield deleteURIPromise;
  provider.uninit();
};

exports.test_Links_onManyLinksChanged = function*(assert) {
  let provider = PlacesProvider.links;
  provider.init();

  let promise = new Promise(resolve => {
    let handler = () => {
      assert.ok(true);
      provider.off("manyLinksChanged", handler);
      resolve();
    };

    provider.on("manyLinksChanged", handler);
  });

  let testURL = "https://example.com/toDelete";
  let testURI = NetUtil.newURI(testURL);
  yield PlacesTestUtils.addVisits(testURI);

  // trigger DecayFrecency
  PlacesUtils.history.QueryInterface(Ci.nsIObserver).
    observe(null, "idle-daily", "");

  yield promise;
  provider.uninit();
};

exports.test_Links__faviconBytesToDataURI = function(assert) {
  let tests = [
    [{favicon: "bar".split("").map(s => s.charCodeAt(0)), mimeType: "foo"}],
    [{favicon: "bar".split("").map(s => s.charCodeAt(0)), mimeType: "foo", xxyy: "quz"}]
  ];
  let provider = PlacesProvider.links;

  for (let test of tests) {
    let clone = JSON.parse(JSON.stringify(test));
    delete clone[0].mimeType;
    clone[0].favicon = `data:foo;base64,${btoa("bar")}`;
    let result = provider._faviconBytesToDataURI(test);
    assert.equal(JSON.stringify(clone), JSON.stringify(result), "favicon converted to data uri");
  }
};

before(exports, function*() {
  let faviconExpiredPromise = new Promise(resolve => {
    systemEvents.once("places-favicons-expired", resolve);
  });
  yield PlacesUtils.favicons.expireAllFavicons();
  yield faviconExpiredPromise;
  PlacesTestUtils.clearBookmarks();
  yield PlacesTestUtils.clearHistory();
});

require("sdk/test").run(exports);