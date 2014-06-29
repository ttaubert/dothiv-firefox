/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {URL} = require("sdk/url");
const self = require("sdk/self");
const tabs = require("sdk/tabs");
const panels = require("sdk/panel");
const {storage} = require("sdk/simple-storage");
const {ActionButton} = require("sdk/ui/button/action");

// Local includes.
const rules = require("rules");
const redirect = require("redirect");

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

  // Enable/disable redirections.
  redirect.toggle(enabled);
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
  redirect.stop();
};
