/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {Cc, Ci} = require("chrome");
const {Request} = require("sdk/request");
const {storage} = require("sdk/simple-storage");

const API_ENDPOINT = "https://dothiv-registry.appspot.com/redirects";
const API_ACCEPT = "application/json";

const UPDATE_TIMER_ID = "dothiv-update-rules";
const UPDATE_TIMER_INTERVAL_SECS = 60 * 60 * 24; // 1 day

let active = false;
let cache = new Map();

exports.start = function () {
  active = true;
  cache = compile(storage.rules || []);

  // TODO
  let utm = Cc["@mozilla.org/updates/timer-manager;1"]
              .getService(Ci.nsIUpdateTimerManager);
  utm.registerTimer(UPDATE_TIMER_ID, update, UPDATE_TIMER_INTERVAL_SECS);
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

// TODO
function update() {
  // TODO
  if (!active) {
    return;
  }

  Request({
    url: API_ENDPOINT,
    headers: {"Accept": API_ACCEPT},
    anonymous: true,

    onComplete: function (resp) {
      if (resp.json) {
        cache = compile(storage.rules = resp.json);
        console.log("update", resp.text);
      }
    }
  }).get();
}

// TODO
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
