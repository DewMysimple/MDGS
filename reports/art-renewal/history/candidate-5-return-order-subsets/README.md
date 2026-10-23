# Candidate 5 focused acceptance, not global acceptance

The return-order fix passed all 8 focused groups and all 16 existing native preparation hardware groups. This does **not** make C5 a globally accepted candidate. The parent full snapshot regression found a separate genuine failure in group 12: when normal viewer-button PNG capture fails and an old matching cached snapshot exists, C5 incorrectly uses that cache instead of its established explicit warm-paper fallback. C5 must retain that failure and be superseded by a separately built and fingerprinted candidate. No failing assertion or threshold was changed.

## Valid passing subsets

- `matrix-runs/2026-10-23T00-50-59-778Z/validation.json`: 8/8, zero errors. Independent normal/reduced contexts, 0.65 and 1 Back/Forward/session reload, controls, real encoded PNG callback held until Back commits. Every successful preview is explicitly nonempty before conversion to a number. Real matching snapshot delivery precedes persistent native cancellation. Full 829 current inputs equal the C5 build fingerprint and remain unchanged; the 744-file candidate package is unchanged.
- `c5-hardware/hardware-runs/2026-10-23T00-53-02-503Z/validation.json`: 16/16, zero errors. Includes genuine shader compilation failure and context loss, explicitly injected KHR absence/timeout, genuine native hidden-window pause/resume, all four native first frames, and late manifest/material owner cancellation with zero submissions. All 829 source inputs, 744 package files, driver inputs and exhibition inventory remain unchanged.

`c5-summary.json` is a compact derived index. The two unique run reports and their copied drivers are the original evidence. Source/App/hook and all packages were read-only throughout these runs. The separate C4 confirmed regression and its original files remain preserved in `reports/art-renewal/history/candidate-4-return-regression/`.

## Test boundary

The 8 focused C5 groups exercise successful real snapshot encoding and a delayed valid result; they do not inject `toBlob(null)`. Thus they prove the Back ordering and in-flight valid-result behavior, while the full snapshot group 12 correctly detects the different viewer-button failure contract. The required fix distinguishes `SCROLL_VIEWER` failure (always explicit fallback and return) from a result arriving after an already begun `RETURNING_HOME` (preserve an existing matching cached paper). The permanently cancelled renderer must remain closed in either case.

The focused test observed Chrome 156 and the actual ANGLE NVIDIA GeForce RTX 5070 Ti D3D11 renderer. These are functional runs concurrent with other functional validation, not a performance benchmark or a display-FPS claim. All browsers and local servers owned by these runs were closed before the parent was notified that product sources could be unfrozen.
