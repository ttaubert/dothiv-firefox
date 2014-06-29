/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {defer} = require("sdk/core/promise");
const {Cc, Ci} = require("chrome");
const {Request} = require("sdk/request");
const {storage} = require("sdk/simple-storage");
const {clearTimeout, setTimeout} = require("sdk/timers");

const API_ENDPOINT = "https://dothiv-registry.appspot.com/redirects";
const API_ACCEPT = "application/json";

const UPDATE_TIMER_ID = "dothiv-update-rules";
// Fetch new rules from the server at most once a day.
const FETCH_INTERVAL_SECS = 60 * 60 * 24;
// Fetches time out after 30s without a response.
const FETCH_TIMEOUT_SECS = 30;
// Wait 30s before retrying when fetching rules fails with an empty cache.
const FETCH_RETRY_SECS = 30;
// Retry for max. 5 minutes.
const FETCH_MAX_RETRIES = 10;

let active = false;
let cache = new Map();
let retries = 0;

exports.start = function () {
  active = true;
  cache = compile(storage.rules || []);

  // Register an update timer.
  let utm = Cc["@mozilla.org/updates/timer-manager;1"]
              .getService(Ci.nsIUpdateTimerManager);
  utm.registerTimer(UPDATE_TIMER_ID, update, FETCH_INTERVAL_SECS);

  // Fetch rules immediately if the cache is empty.
  if (cache.size == 0) {
    update();
  }
};

exports.stop = function () {
  active = false;
};

exports.has = function (host) {
  return cache.has(host);
};

exports.get = function (host) {
  return cache.get(host);
};

// Update the rules.
function update() {
  // We can't unregister timers so let's ignore updates if disabled.
  if (!active) {
    return;
  }

  fetch().then(data => {
    retries = 0;
    cache = compile(storage.rules = data);
  }, err => {
    // If the cache is empty let's retry real quick.
    if (cache.size == 0) {
      setTimeout(retry, FETCH_RETRY_SECS * 1000);
    }
  });
}

// Fetching failed, retry.
function retry() {
  if (++retries <= FETCH_MAX_RETRIES) {
    update();
  } else {
    retries = 0;
  }
}

// Fetch new rules from the server.
function fetch() {
  let {promise, resolve, reject} = defer();
  let timeout = setTimeout(reject, FETCH_TIMEOUT_SECS * 1000);

  Request({
    url: API_ENDPOINT,
    headers: {"Accept": API_ACCEPT},
    anonymous: true,

    onComplete: function (resp) {
      // The add-on could've been disabled in the meantime.
      if (!active) {
        return;
      }

      clearTimeout(timeout);

      if (resp.json) {
        resolve(resp.json);
      } else {
        reject();
      }
    }
  }).get();

  return promise;
}

// Convert the given rule set into a convenient data structure.
function compile(rulesets) {
  let compiled = new Map();

  for (let ruleset of rulesets) {
    let data = {rules: ruleset.rules};
    for (let rule of data.rules) {
      rule.from = new RegExp(rule.from);
    }

    data.exceptions = ruleset.exceptions || [];
    data.exceptions = data.exceptions.map(ex => new RegExp(ex));

    for (let host of ruleset.hosts) {
      compiled.set(host, data);
    }
  }

  return compiled;
}
