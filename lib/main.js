/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {URL} = require("sdk/url");
const self = require("sdk/self");
const tabs = require("sdk/tabs");
const utils = require("sdk/window/utils");
const panels = require("sdk/panel");
const locale = require("sdk/l10n/locale");
const winUtils = require("sdk/deprecated/window-utils");
const {storage} = require("sdk/simple-storage");
const {ActionButton} = require("sdk/ui/button/action");
const {getActiveView} = require("sdk/view/core");

// Local includes.
const rules = require("rules");

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

panel.port.on("ready", function () {
  // Update the panel's language.
  let currentLocale = locale.findClosestLocale(["en-us", "de-de"]) || "en-us";
  panel.port.emit("locale", currentLocale);
});

// Activate tooltips for our panel.
getActiveView(panel).querySelector("iframe").setAttribute("tooltip", "aHTMLTooltip");

panel.port.on("resize", function ({width, height}) {
  // Update the panel size.
  panel.resize(width + 6, height + 6);
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
    icons = isHIVPage(tab.url) ? ICONS_ON : ICONS_OFF;
  }

  button.state(tab, {icon: icons});
}

// Returns whether a given URL is part of the dotHIV network.
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

// Manage frame scripts and message listeners.
new winUtils.WindowTracker({
  onTrack: function (window) {
    if (utils.isBrowser(window)) {
      let mm = window.getGroupMessageManager("browsers");
      mm.loadFrameScript(self.data.url("content.js"), true);
      mm.addMessageListener("dothiv:determineRedirectURI", onDetermineRedirectURI);
    }
  },

  onUntrack: function (window) {
    if (utils.isBrowser(window)) {
      let mm = window.getGroupMessageManager("browsers");
      mm.removeDelayedFrameScript(self.data.url("content.js"));
      mm.removeMessageListener("dothiv:determineRedirectURI", onDetermineRedirectURI);
    }
  }
});

function onDetermineRedirectURI({data: uri}) {
  if (!("enabled" in storage ? storage.enabled : true)) {
    return null;
  }

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

// Generates all combinations that have redirect rules.
function* getHostCombinations(host) {
  for (let combi of getPossibleHostCombinations(host)) {
    if (rules.has(combi)) {
      yield combi;
    }
  }
}

// Generates all possible combinations for a given host.
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

// Called when the add-on is loaded.
exports.main = function () {
  rules.start();

  // Set initial button and tab states.
  updateGeneralState("enabled" in storage ? storage.enabled : true);

  // Update the panel's checkbox state.
  panel.port.emit("toggle", storage.enabled);
};

// Called when the add-on is unloaded.
exports.onUnload = function () {
  rules.stop();
};
