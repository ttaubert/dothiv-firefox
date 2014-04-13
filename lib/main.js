/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {Ci} = require("chrome");
const self = require("sdk/self");
const tabs = require("sdk/tabs");
const panels = require("sdk/panel");
const events = require("sdk/system/events");
const {ActionButton} = require("sdk/ui/button/action");

// The notification sent right before requests start.
const TOPIC = "http-on-modify-request";

// TODO this should be read from some server
const REDIRECTS = {"google.de": {host: "google.hiv"}};

let panel = panels.Panel({
  contentURL: self.data.url("panel.html"),
  contentScriptFile: self.data.url("panel.js")
});

panel.port.on("load", function ({width, height}) {
  panel.resize(width + 18, height + 18);
});

panel.port.on("navigate", function (url) {
  tabs.open(url);
  panel.hide();
});

let button = ActionButton({
  id: "dothiv-button",
  label: "dotHIV",

  icon: {
    "16": "./icon.png",
    "32": "./icon.png"
  },

  onClick: function (state) {
    panel.show({position: button});
  }
});

/**
 * This is called when the add-on is loaded.
 */
exports.main = function () {
  events.on(TOPIC, onModifyRequest);
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

  let redirectURI = determineRedirectURI(uri);

  if (redirectURI) {
    channel.redirectTo(redirectURI);
  }
}

/**
 * Returns the target redirection URI for a given URI.
 * Returns null if the given host is not in the redirection map.
 */
function determineRedirectURI(uri) {
  let host;

  try {
    host = uri.host;
  } catch (e) {
    return null; // No host.
  }

  if (!(host in REDIRECTS)) {
    return null; // No redirect entry.
  }

  let redirectURI = uri.clone();
  redirectURI.host = REDIRECTS[host].host;
  return redirectURI;
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
