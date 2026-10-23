# Isolated native shader readiness experiment

This is an unadopted prototype, not a change to the protected product renderer.
The same current source/public/config inputs (including the new chapter-two
curatorial date note) build both `base-dist` and `../shader-warmup-dist`.
The Vite pre-loader keeps the original SceneRenderer module ID, so its relative
imports resolve unchanged, and injects exactly one helper through a virtual ID.
`build-binding.json` records every input, full override/helper/driver bytes and
both package SHA sets. Existing dist/candidate/exhibition packages are untouched.

## Mechanism and limits

- Public `renderer.compile` links native shader variants; no `compileAsync`,
  private React/renderer properties, disabled error checks, or author-time edits.
- Exact geometry, material, source shader callback and source uniforms are
  shared by compile-only Mesh proxies. Original visibility, transforms, morph
  weights, source masks and pixel programs are not changed. Proxies never draw.
- The depth/dithered opaque DoubleSide variant and transparent Back/Front
  variants are compiled against a linear non-XR render target, matching the
  real native shadow/post passes. Uniform-only pass changes are not recompiled.
  All materials conservatively get both states: DITHERED programs can also be
  transparent in NarrativeSpace's original color pass. Extra unused variants
  are an explicit preparation-time/program-memory cost, not a free optimization.
- Default `features` mode temporarily supplies the expected 2D/sRGB/channel-zero
  map *only while compiling* if the exact image has not arrived. It restores
  map/side/transparent/depthWrite and target/viewport/scissor synchronously in
  `finally`. The placeholder is never uploaded or drawn. Native fields already
  have static sampler declarations, so field data changes do not alter GLSL.
- `?shaderWarmup=ready` is a conservative comparison: only complete real map and
  field sets are compiled. It can miss the next-frame streaming/shadow deadline;
  this timing race is the reason to test feature-ahead preparation.
- Completion polling uses `KHR_parallel_shader_compile` and *all*
  `renderer.info.programs[].program` handles, including BackSide omitted by
  Three r180 compileAsync's material.currentProgram polling. Completion is not
  successful link validation: original first-use shader errors remain active.
- Initial incomplete relevant programs hold only the real native first draw.
  Native first-frame readiness still requires its actual rendered resource set;
  the existing visible four-second paper ceremony is not reset or duplicated.
  Interactive playback never waits or changes its clock. Future compile work is
  best effort; this experiment cannot guarantee no later first-use stall.
- KHR absent: unchanged original first-use path. Context loss invalidates helper
  generations; restore re-enqueues against the new GL lifetime. Hidden pages
  stop all helper timers. Return/cancel stops queue and polling immediately.
  A 30-second preparation bound or exception falls back to the original draw.
  Disposal stops timers/observer and disposes only helper-owned texture/RT;
  renderer remains the sole owner of native programs/shared art resources.

## Known experimental risks to measure before adoption

Compile submission itself has main-thread cost and a one-material batch is not
an upper bound on one task duration. Preparing all future programs may trade
first-visit mid-scroll stalls for entry cost and resident program memory. The
first-frame barrier must not deadlock empty/error/reduced-motion/resize/cancel
cases. A failed native link must still invoke the original shader error handler.
Source program map features, linear target and morph count require strict pixel
and 59-frame protection before this can be considered for product adoption.
The helper's cancellation observer is prototype-specific; a product version
would preferably receive an explicit cancellation signal from its existing owner.

## Execution

`node tmp/shader-warmup/build-prototype.mjs`

`node tmp/shader-warmup/typecheck-prototype.mjs`

Initial build preflight failed because Vite did not strip TypeScript syntax
from the null-prefixed virtual helper ID. The loader now explicitly calls
Vite's transformWithEsbuild for that helper. This affected only tmp outputs;
the product and candidate packages were not rebuilt or changed.

No performance measurements are valid until a separate quiet GPU window, actual
GPU/version recording, source/package hash verification and paired real-time
tests. CDP capture throughput is never treated as product frame rate.
