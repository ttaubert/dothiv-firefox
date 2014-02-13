/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {Ci} = require("chrome");
const events = require("sdk/system/events");

// The notification sent right before requests start.
const TOPIC = "http-on-modify-request";

// TODO this should be read from some server
const HOSTS = {"google.de": "google.hiv"};

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

  let redirectURI = determineRedirectURI(channel.URI);

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

  if (!(host in HOSTS)) {
    return null; // No redirect entry.
  }

  let redirectURI = uri.clone();
  redirectURI.host = HOSTS[host];
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
