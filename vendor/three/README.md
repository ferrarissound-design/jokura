# three.js vendor bundle

`three.r128.min.js` is the expected self-hosted copy of three.js r128 used by `index.html` so the game can boot without contacting a CDN.

Source: https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js
License: MIT (three.js)

The committed bundle is copied from `three@0.128.0/build/three.min.js` on npm.
The upstream MIT license is included in `LICENSE`.

If this version is upgraded, test the rendering code carefully because several renderer/color-management APIs changed in later three.js releases.
