/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {URL} = require("sdk/url");
const {Ci} = require("chrome");
const self = require("sdk/self");
const tabs = require("sdk/tabs");
const rules = require("rules");
const panels = require("sdk/panel");
const events = require("sdk/system/events");
const {newURI} = require("sdk/url/utils");
const {storage} = require("sdk/simple-storage");
const {ActionButton} = require("sdk/ui/button/action");

// The notification sent right before requests start.
const TOPIC = "http-on-modify-request";

// Paths to toolbar state icons.
const ICONS_ON = makeIconPaths("on");
const ICONS_OFF = makeIconPaths("off");
const ICONS_DISABLED = makeIconPaths("disabled");

function makeIconPaths(state) {
  let paths = {};

  for (let size of ["18", "32", "36", "64"]) {
    paths[size] = "./images/toolbar/toolbar-" + state + "-" + size + ".png";
  }

  return paths;
}

// The panel that is shown when clicking the toolbar button.
let panel = panels.Panel({
  contentURL: self.data.url("panel.html"),
  contentScriptFile: self.data.url("panel.js"),
  contentScriptWhen: "end"
});

// The dotHIV toolbar button.
let button = ActionButton({
  id: "dothiv-button",
  label: "dotHIV",
  icon: ICONS_OFF,

  onClick: function (state) {
    panel.show({position: button});
  }
});

panel.port.on("ready", function ({width, height}) {
  panel.resize(width + 18, height + 18);
});

panel.port.on("navigate", function (url) {
  tabs.open(url);
  panel.hide();
});

// Update the general state when the panel's checkbox changes.
panel.port.on("toggle", updateGeneralState);

function updateGeneralState(enabled) {
  storage.enabled = enabled;

  // Set default icon for newly opened tabs.
  button.icon = storage.enabled ? ICONS_OFF : ICONS_DISABLED;

  // Iterate all tabs and update icons.
  for (let tab of tabs) {
    updateTabState(tab);
  }
}

// When a tab finishes loading, update the toolbar button state.
tabs.on("ready", updateTabState);

function updateTabState(tab) {
  let icons = ICONS_DISABLED;

  if (storage.enabled) {
    icons = isHIVPage(tab.url)? ICONS_ON : ICONS_OFF;
  }

  button.state(tab, {icon: icons});
}

/**
 * Returns whether a given URL is part of the dotHIV network.
 */
function isHIVPage(url) {
  let {host} = new URL(url);

  // No host, probably an about: page.
  if (!host) {
    return false;
  }

  let parts = host.split(".");
  let last = parts.pop();

  // All .hiv domains.
  if (last == "hiv") {
    return true;
  }

  // For dothiv.org pages.
  return last == "org" && parts.pop() == "dothiv";
}

/**
 * This is called when the add-on is loaded.
 */
exports.main = function () {
  events.on(TOPIC, onModifyRequest);
  updateGeneralState("enabled" in storage ? storage.enabled : true);

  // Update the panel's checkbox state.
  panel.port.emit("toggle", storage.enabled);
};

/**
 * This is called when the add-on is unloaded.
 */
exports.onUnload = function () {
  events.off(TOPIC, onModifyRequest);
};

/**
 * Called right before a request channel is opened.
 */
function onModifyRequest({subject: channel}) {
  if (!isHttpChannel(channel) || !isTopLevelChannel(channel)) {
    return;
  }

  // Ignore request methods other than GET.
  if (channel.requestMethod != "GET") {
    return;
  }

  let uri = channel.URI;

  // Ignore schemes other than HTTP and HTTPS.
  if (!uri.schemeIs("http") && !uri.schemeIs("https")) {
    return;
  }

  let redirectURI = determineRedirectURI(uri.spec);
  console.log("redirectURI", redirectURI);

  if (redirectURI) {
    channel.redirectTo(newURI(redirectURI));
  }
}

/**
 * TODO
 */
function determineRedirectURI(uri) {
  let {host} = new URL(uri);

  // Try all valid host combinations including wild cards.
  for (let combi of getHostCombinations(host)) {
    let data = rules.get(combi);

    // Try subsequent rulesets if we hit an exception.
    if (data.exceptions.some(ex => ex.test(uri))) {
      continue;
    }

    // Try all rules.
    for (let rule of data.rules) {
      let newURI = uri.replace(rule.from, rule.to);

      // Check if the rule was applicable.
      if (newURI != uri) {
        return newURI;
      }
    }
  }

  // No redirects found.
  return null;
}

/**
 * TODO
 */
function* getHostCombinations(host) {
  for (let combi of getPossibleHostCombinations(host)) {
    if (rules.has(combi)) {
      yield combi;
    }
  }
}

/**
 * TODO
 */
function* getPossibleHostCombinations(host) {
  // The given host.
  yield host;

  let parts = host.split(".");

  // If there are only two parts left we can stop.
  if (parts.length < 3) {
    return;
  }

  // Remove the first subdomain.
  let rest = parts.slice(1).join(".");

  // Try a wild card.
  yield "*." + rest;

  // Try the parent domain.
  yield* getPossibleHostCombinations(rest);
}

/**
 * Returns whether the given channel is an http channel instance.
 */
function isHttpChannel(channel) {
  try {
    return !!channel.QueryInterface(Ci.nsIHttpChannel);
  } catch (e) {
    return false;
  }
}

/**
 * Returns whether the given channel is a top level request.
 */
function isTopLevelChannel(channel) {
  let webProgress;

  try {
    webProgress = channel.notificationCallbacks.getInterface(Ci.nsIWebProgress);
  } catch (e) {
    return; // nsIWebProgress not available.
  }

  return webProgress.isTopLevel;
}
