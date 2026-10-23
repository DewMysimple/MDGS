# Shader warmup isolated A/B: observed, not adopted

Measured 2026-10-23 07:39–07:43 Asia/Shanghai, quiet GPU window coordinated
with the other agents. Chrome 156.0.8078.47, actual ANGLE NVIDIA GeForce RTX
5070 Ti Direct3D11 renderer, 1920×1080 CSS pixels, DPR1. Fresh browser per case,
real chapter3 autoplay from zero to .5, ABBA order. Driver/OS shader caches were
not cleared. No screenshot/trace stream during the measurement. Equal CDP CPU
sampling at1000µs has overhead, so these are paired diagnostic observations,
not monitor presentation FPS or a hardware certification.

The base and feature-ahead warm builds use the same828 current source/public/
config inputs, including the new dated curatorial note and complete WenKai
subset. No product source, original243 image bytes, source material body,
camera, fields, source clock, post effect or resolution is changed. Warm is an
explicit virtual SceneRenderer override plus helper, not candidate3's bundle.
All inputs, both744-file packages and8 exact experiment files remained SHA
identical before/after. All four cases had zero runtime/HTTP/shader errors.

| Order | Kind | Entry ms | .15–.5 max rAF gap ms | >50ms longtasks | Native counter/s | getProgramInfoLog self ms, zero–.5 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | base | 8572 | 588.9 | 28 | 133.64 | 8270.2 |
| 2 | warm | 6220 | 44.5 | 0 | 175.81 | 62.7 |
| 3 | warm | 6186 | 33.4 | 0 | 175.68 | 53.9 |
| 4 | base | 8551 | 633.3 | 25 | 131.56 | 8441.9 |

Native count is the cumulative completed CPU submission path, read through the
existing nominal100ms diagnostic cadence. It does not establish individual
native frame intervals, GPU completion or screen presentation. The independent
page rAF gaps show the repeatable long-stop difference. CPU self time above is
full zero–.5 autoplay; it must not be relabeled as only the .15–.5 rAF window.

The79 real source materials were queued/completed in both warm runs. Queues
and KHR pending handles reached zero; native debug.checkShaderErrors stayed
true. Compile submission calls took164.9/238.0ms in aggregate, spread over
tasks. This is CPU submission cost, not GPU shader compiler time. Prewarming
every material's opaque DoubleSide and transparent Back/Front states prepares
the original color readback as well as shadows/post; some variants can be
unused, with resident-program cost not yet measured.

Native first-frame DOM diagnostics arrived at4224.9/4196.1ms in base and
2352.9/2440.5ms in warm. The correct conservative visible paper gate uses
`viewerAt - max(paperReadyAt, SCROLL_LOADING.at)`; all four were4666.2–4672.3ms.
The raw driver mistakenly named its earlier-ready subtraction
`visiblePaperBeforeViewerMilliseconds` even though the paper can be prepared
before its visible SCROLL_LOADING phase. The raw report is retained unchanged;
the linked summary explicitly corrects that derived label using recorded
phase timestamps. Neither observer timing proves optical screen presentation.

Evidence:

- [Original report](runs/2026-10-22T23-39-18-467Z/validation.json), with CPU
  artifacts and complete SHA bindings.
- [Corrected derived summary](ab-comparison-summary.json), bound to that exact
  report SHA; full-profile samples recalculated rather than treating top35
  omission as zero time.
- [Exact tested experiment files](runs/2026-10-22T23-39-18-467Z/experiment/),8
  inputs copied after the run and individually checked against its SHA record.
- [Pure JS lifecycle fixture](helper-safety.json),5 groups; it is not a hardware,
  shader-key or original-pixel test.

This is promising enough to continue isolated validation. It is not ready for
product adoption. In particular, cancellation while the first program batch
is unfinished can currently call helper.stop→wake and let initialReady fall
back to a synchronous native draw. That may delay warm-paper return and must
be fixed/tested in the prototype before adoption. Hardware context loss/restore,
missing KHR, real native shader failure, slow/error resources, reduced motion,
resize and all-four-scroll behavior remain to be exercised. The complete59
original-frame thresholds and243-image protection must pass unchanged. Heap
endpoints without forced GC do not prove stable retained memory, and this c3
pair does not establish all-chapter performance.
