/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {storage} = require("sdk/simple-storage");

// TODO this should be read from some server
const REDIRECTS = [
  {
    hosts: [
      "google.de",
      "*.google.de"
    ],

    rules: [
      {from: "^http(s)?://(.+\.)?google\.de/", to: "http$1://$2google.hiv/"}
    ],

    exceptions: [
      "^http://(.+\.)?google\.de/notme"
    ]
  }
];

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

exports.has = function (host) {
  return compile(REDIRECTS).has(host);
};

exports.get = function (host) {
  return compile(REDIRECTS).get(host);
};
