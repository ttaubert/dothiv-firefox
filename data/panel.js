/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Let the parent know our dimensions so that
// the panel has the same size as the content.
addEventListener("load", function () {
  let {offsetWidth: width, offsetHeight: height} = document.body;
  self.port.emit("load", {width: width, height: height});
});

// Hide the panel after opening a new tab.
addEventListener("click", function (event) {
  if (event.target.nodeName == "A") {
    event.preventDefault();
    self.port.emit("navigate", event.target.getAttribute("href"));
  }
});
