/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {Ci} = require("chrome");
const {URL} = require("sdk/url");
const events = require("sdk/system/events");
const {newURI} = require("sdk/url/utils");
const {setTimeout} = require("sdk/timers");

// Local includes.
const rules = require("rules");

// The notification sent right before requests start.
const TOPIC = "http-on-modify-request";

// Delay after which hosts will be unblocked.
const UNBLOCK_TIMEOUT = 30 * 1000;

// List of temporarily blocked domains.
let blockedDomains = new Set();

exports.toggle = function (enabled) {
  if (enabled) {
    events.on(TOPIC, onModifyRequest);
  } else {
    events.off(TOPIC, onModifyRequest);
  }
};

exports.stop = function () {
  events.off(TOPIC, onModifyRequest);
};

// Called right before a request channel is opened.
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

  let {host} = new URL(uri.spec);
  let domain = getDomainFromHost(host);

  // Ignore temporarily blocked domains. This helps with pages redirecting
  // back to their original domain to prevent infinite redirect loops.
  if (blockedDomains.has(domain)) {
    return;
  }

  let redirectURI = determineRedirectURI(uri.spec);
  if (!redirectURI) {
    return;
  }

  // Redirect to our .hiv domain.
  channel.redirectTo(newURI(redirectURI));

  // Ignore requests from this domain for the next few seconds.
  blockedDomains.add(domain);
  setTimeout(() => blockedDomains.delete(domain), UNBLOCK_TIMEOUT);
}

// Return the domain part of a given host name.
function getDomainFromHost(host) {
  return host.split(".").slice(-2).join(".");
}

// Returns the URI to redirect to for a given URI. Null for no redirect.
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
