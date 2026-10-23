# C4 history-return capture ordering diagnosis

Read-only product review, 2026-10-23. No source, public assets, packages, or existing validation drivers were modified. The focused test created only files below `tmp/return-capture-diagnosis/`.

## Observed production counterexample

Actual frozen C4, Chrome 156, independent contexts, chapter 4 at progress 0.65:

| Action | New canvas `toBlob` calls | Native `renderCount` change | Return paper |
| --- | ---: | ---: | --- |
| App return button | 1 | 1 | `previewProgress=0.65`, `handoffState=returning` |
| Browser Back | 0 | 0 | empty preview, `handoffState=return-fallback` |

The first observed Browser Back `RETURNING_HOME` sample already reports `shaderWarmup.cancelled=true`, `reason=owner-return`. It never submits another native frame or attempts a new canvas encoding, despite `firstFrameReady=true`, all textures ready, and no shader/texture/page errors. The matching image therefore cannot be produced. The existing bounded fallback still returns home; this is a lost artwork closing transition rather than an indefinite trap.

Raw evidence: `runs/2026-10-23T00-39-16-940Z/validation.json` plus button/back screenshots. Its `confirmed-regression` status means that the expected genuine defect was observed; it does not mean that C4 passed this behavior. Seven relevant source hashes and all five package code hashes match the C4 build fingerprint before and after. This focused read-only run does not replace the full 829-input inventory, and concurrent functional/soak checks mean these event timestamps are not a performance benchmark.

## Causal chain

1. Browser Back enters `useStudyJourney.returnHome(true)` (hook lines 70-79), flips `phase` to `RETURNING_HOME`, and stops playback.
2. App line 293 passes `preparationCancelled=true` for every returning phase.
3. `ScrollViewport` line 162 runs its layout effect and calls the one-way `SceneRenderer.cancelPreparation()` before the parent App passive effect at lines 145-160.
4. Renderer lines 411-416 cancel its scheduled frame and persistently mark this renderer lifetime cancelled. Its `requestFrame()` and `render()` guards at lines 546 and 775 correctly prevent further native draws.
5. App's Browser Back effect then requests `handle.capture()`. `captureArtworkSnapshot()` (lines 294-308) queues a fresh completed GPU frame rather than copying a potentially cleared idle drawing buffer. That necessary frame is blocked by step 4, so its 1500 ms timeout rejects. App sets `presentationFallback=true`.
6. The normal button obtains the fresh frame and encodes it first (App lines 117-143), then changes phase, so it does not encounter this order.

No material, map, native source field, shader, authored camera, pixel cap, clock, or drawing-buffer persistence change is needed.

## Minimal product proposal (not applied)

Capture the origin explicitly in the journey hook. Suggested public field: `returningFromViewer: boolean`.

```tsx
const [returningFromViewer, setReturningFromViewer] = useState(false);

// resetPreparation(): clear along with presentation/return state.
setReturningFromViewer(false);

// returnHome(): after duplicate-return guard, BEFORE changing phaseRef.
setReturningFromViewer(phaseRef.current === 'SCROLL_VIEWER');

// Return the new boolean from useStudyJourney.
```

App derives the cancellation decision from React state so receiving a snapshot causes the cancellation decision to be reevaluated:

```tsx
const matchingReturnSnapshot = matchesArtworkSnapshot(
  snapshots[chapterId], chapterId, progress,
);
const cancelNativePreparation = journey.phase === 'RETURNING_HOME' && (
  !journey.returningFromViewer || matchingReturnSnapshot ||
  presentationFallback || journey.returnFallback
);

// ScrollViewport
preparationCancelled={cancelNativePreparation}
```

The Browser Back capture effect should run only when `returningFromViewer` is true, no matching snapshot exists, neither fallback is active, and no capture is already in flight. Include the new origin/fallback values in its dependency list. This prevents an initial-loading cancellation from issuing an unnecessary snapshot request. Keep existing chapter/attempt/phase checks, exact snapshot progress freeze, object-URL cleanup, and bounded failure behavior.

| Returning origin and available presentation | Cancel native immediately? | Required action |
| --- | --- | --- |
| Initial loading, including delayed manifest/material/helper construction | Yes | Same existing zero-submission owner cancellation |
| Partly opened prepared loading paper | Yes | Existing independent paper closes at its current curvature |
| Viewer, matching cached current snapshot | Yes | Existing matching image closes |
| Viewer, stale/missing current snapshot, no fallback | No | Request one real completed native frame and encode it |
| Same viewer capture succeeds | Yes, next state commit | Freeze snapshot progress, install snapshot, then close native owner |
| Capture fails or return watchdog chooses warm fallback | Yes | Plain warm-paper exit, no cover-zero substitution |

Do not reopen `SceneRenderer` after cancellation and do not allow its render guard to ignore cancellation for arbitrary snapshot requests. That alternative weakens the late-helper and late-texture zero-draw guarantees already verified in the 16 hardware cases. Do not derive origin from material readiness: a loading native canvas can already be ready while the separate paper is still opening.

## In-flight return-button / Back edge

The button currently accepts its capture only while live phase is `SCROLL_VIEWER`. If Back occurs during that encoding, the result is discarded although its chapter and attempt still match, and the Back effect sees the in-flight request and exits. Clearing the ref in `finally` does not itself cause a React render. The existing watchdog eventually falls back, but the valid image is unnecessarily lost.

Recommended adjacent boundary fix: allow the existing button capture result to be accepted for the same chapter/attempt in either `SCROLL_VIEWER` or `RETURNING_HOME`. Only call `journey.returnHome()` if still in the viewer. If failure occurs while returning, request fallback only when no matching cached snapshot is available; an already correct cached paper should not be replaced by warm paper solely because a redundant in-flight request was cancelled. Keep rejection/release for HOME, another chapter, or another attempt. This race is a static finding; the focused run above did not inject an encoding delay or dynamically test it.

## Focused retest after a separate candidate build

The existing `focused.cjs` supports `MDGS_RETURN_EXPECT=fixed` and independently specified `MDGS_RETURN_DIST` / `MDGS_RETURN_BUILD`. Its fixed mode requires both actions to produce matching 0.65 previews; Browser Back must show a new real encoding rather than passing an empty string through `Number('')`.

Broader acceptance should include Browser Back at 0.65 and 1, normal and reduced motion, session-preserving reentry and forward traversal, matching-cached zero progress, capture GPU/encoding failure fallback, and button-capture-in-flight followed by Back. The original hardware 16 cases, especially late manifest/material creation, must still verify zero native submissions after loading-owner cancellation. Snapshot 15 and the full candidate chain must run again against the final same-source package; the C4 failure remains historical evidence.
