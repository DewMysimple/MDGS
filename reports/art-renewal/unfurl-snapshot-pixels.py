"""Compare actual resumed paper/native screenshots to the copied source frame.

This is a broad composition/colour check, not native source fidelity proof.
The existing unroll thresholds (MAE <5, p95 <15) are kept unchanged.
"""
from PIL import Image, ImageChops
from pathlib import Path
import hashlib
import json
import shutil
import sys
from datetime import datetime, timezone

directory = Path(__file__).resolve().parent
source = directory / "unfurl-snapshot-validation.json"
target = directory / "unfurl-snapshot-pixel-validation.json"
report = {"status": "running", "startedAt": datetime.now(timezone.utc).isoformat(),
          "method": "Rounded actual camera/print rect; RGB Lanczos to 256px; unchanged broad unroll MAE<5 and p95<15. Narrative DOM is hidden only for clean native evidence. No artwork is edited.",
          "checks": [], "errors": []}
if target.exists():
    history = directory / "unfurl-snapshot-pixel-history" / datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S-%fZ")
    history.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(target, history / "previous-validation.json")
target.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
try:
    data = json.loads(source.read_text(encoding="utf-8"))
    if data["status"] != "passed":
        raise RuntimeError("Snapshot browser run did not pass.")
    report["browserRunId"] = data["runId"]
    report["browserReportSha256"] = hashlib.sha256(source.read_bytes()).hexdigest()
    report["driverSha256"] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    run = directory / "unfurl-snapshot-runs" / data["runId"]
    report["captures"] = {}
    for case in data["checks"]:
        if "files" not in case:
            continue
        expected_file = run / case["files"]["snapshot"]
        expected = Image.open(expected_file).convert("RGB")
        size = (256, round(256 * expected.height / expected.width))
        expected = expected.resize(size, Image.Resampling.LANCZOS)
        for kind, key, rect in [("physical", "paper", json.loads(case["preview"]["projectedArtRect"])),
                                ("native", "cleanNative", case["nativeRect"])]:
            actual_file = run / case["files"][key]
            actual = Image.open(actual_file).convert("RGB").crop((round(rect["left"]), round(rect["top"]),
                round(rect["left"] + rect["width"]), round(rect["top"] + rect["height"]))).resize(size, Image.Resampling.LANCZOS)
            values = sorted(sum(pixel) / 3 for pixel in ImageChops.difference(expected, actual).getdata())
            mae = sum(values) / len(values)
            p95 = values[int(len(values) * .95)]
            report["checks"].append({"test": case["test"], "comparison": kind + "-versus-actual-source-snapshot",
                "meanAbsoluteRGBDifference": mae, "p95AbsoluteRGBDifference": p95, "maxAbsoluteRGBDifference": max(values),
                "downsampledSize": size, "passed": mae < 5 and p95 < 15})
            for file in [expected_file, actual_file]:
                report["captures"][str(file.relative_to(directory)).replace("\\", "/")] = hashlib.sha256(file.read_bytes()).hexdigest()
    if not report["checks"] or not all(check["passed"] for check in report["checks"]):
        raise RuntimeError("At least one restored paper/native frame differs beyond the existing unroll thresholds.")
    report["status"] = "passed"
except Exception as error:
    report["status"] = "failed"
    report["errors"].append(str(error))
finally:
    report["completedAt"] = datetime.now(timezone.utc).isoformat()
    target.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "checks": len(report["checks"]), "errors": report["errors"]}))
if report["status"] != "passed":
    sys.exit(1)
