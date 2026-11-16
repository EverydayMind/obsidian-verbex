# deepmerge (patched copy)

Upstream: https://github.com/TehShrike/deepmerge, version 4.3.1, MIT (see LICENSE).

Advisory GHSA-gcqx-w48m-w2h4 (prototype poisoning in `mergeObject`) covers 4.2.0 to 4.3.1 and has no upstream fix. This copy is `dist/cjs.js` from 4.3.1 with one change: keys are written through `setOwn`, which defines an own `__proto__` key as an own property instead of assigning through the prototype setter.

It is wired in by the `overrides` entry for `jest-config` in the root `package.json`. Nothing in the plugin bundle uses it. Remove it once upstream ships a fixed release.
