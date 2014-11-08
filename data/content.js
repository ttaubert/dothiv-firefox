/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const Ci = Components.interfaces;

// The notification sent right before requests start.
const TOPIC = "http-on-modify-request";

function observer(channel) {
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

  // Ask the parent to determine whether we should redirect.
  let redirectURI = sendSyncMessage("dothiv:determineRedirectURI", uri.spec)[0];

  if (redirectURI) {
    channel.redirectTo(Services.io.newURI(redirectURI, null, null));
  }
}

// Returns whether the given channel is an http channel instance.
function isHttpChannel(channel) {
  try {
    return !!channel.QueryInterface(Ci.nsIHttpChannel);
  } catch (e) {
    return false;
  }
}

// Returns whether the given channel is a top level request.
function isTopLevelChannel(channel) {
  let webProgress;

  try {
    webProgress = channel.notificationCallbacks.getInterface(Ci.nsIWebProgress);
  } catch (e) {
    return; // nsIWebProgress not available.
  }

  return webProgress.isTopLevel;
}

Services.obs.addObserver(observer, TOPIC, false);

// Clean up when the docShell goes away.
addEventListener("unload", function () {
  Services.obs.removeObserver(observer, TOPIC, false);
});
