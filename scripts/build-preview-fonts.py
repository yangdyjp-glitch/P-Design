"""Regenerate optional web preview subsets; full export/runtime fonts stay intact.

Requires fonttools[woff]. Generated subsets retain OFL attribution and use a new
family name. Never include product copy in the character selection.
"""
from pathlib import Path
import hashlib
import json
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import DecomposingRecordingPen

root = Path(__file__).resolve().parents[1]
font_dir = root / "public/assets/fonts"
destination = font_dir / "preview"
destination.mkdir(exist_ok=True)
common = set(range(0x0000, 0x0300)) | set(range(0x2000, 0x2700))
common |= set(range(0x3000, 0x3100)) | set(range(0xFF00, 0xFFF0))
for first in range(0xB0, 0xD8):
    for second in range(0xA1, 0xFF):
        try:
            common.add(ord(bytes([first, second]).decode("gb2312")))
        except UnicodeDecodeError:
            pass
for row in range(0x30, 0x50):
    for cell in range(0x21, 0x7F):
        try:
            common.add(ord(bytes([row + 0x80, cell + 0x80]).decode("euc_jp")))
        except UnicodeDecodeError:
            pass

def unicode_ranges(characters):
    runs = []
    for point in sorted(characters):
        if runs and point == runs[-1][1] + 1:
            runs[-1][1] = point
        else:
            runs.append([point, point])
    return ",".join("U+%X" % start if start == end else "U+%X-%X" % (start, end) for start, end in runs)

weights = [("Regular", 400), ("Medium", 500), ("Bold", 700), ("Black", 900)]
coverage = common.copy()
for name, _ in weights:
    coverage &= set(TTFont(font_dir / ("NotoSansSC-" + name + ".woff2")).getBestCmap())
manifest = {"unicodeRange": unicode_ranges(coverage), "characters": len(coverage), "fonts": []}
for name, weight in weights:
    source = font_dir / ("NotoSansSC-" + name + ".woff2")
    original = TTFont(source, recalcTimestamp=False)
    modified = TTFont(source, recalcTimestamp=False)
    options = subset.Options()
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.name_legacy = True
    options.name_languages = ["*"]
    options.recalc_bounds = False
    worker = subset.Subsetter(options=options)
    worker.populate(unicodes=coverage)
    worker.subset(modified)
    for record in modified["name"].names:
        replacement = {1: "TuXu Preview Sans", 2: name, 3: "TuXuPreviewSans-" + name,
                       4: "TuXu Preview Sans " + name, 6: "TuXuPreviewSans-" + name,
                       16: "TuXu Preview Sans", 17: name}.get(record.nameID)
        if replacement:
            record.string = replacement.encode(record.getEncoding())
    modified.flavor = "woff2"
    temporary = destination / (name + ".woff2")
    modified.save(temporary)
    data = temporary.read_bytes()
    sha = hashlib.sha256(data).hexdigest()
    target = destination / ("TuXuPreviewSans-" + name + "." + sha[:12] + ".woff2")
    temporary.replace(target)
    reread = TTFont(target)
    old_map, new_map = original.getBestCmap(), reread.getBestCmap()
    assert set(new_map) == coverage
    assert original["head"].unitsPerEm == reread["head"].unitsPerEm
    old_glyphs, new_glyphs = original.getGlyphSet(), reread.getGlyphSet()
    for point in coverage:
        old_name, new_name = old_map[point], new_map[point]
        assert original["hmtx"][old_name] == reread["hmtx"][new_name]
    ordered = sorted(coverage)
    samples = set(ordered[::max(1, len(ordered) // 128)])
    samples |= set(map(ord, "中文图文排版，字体大小、段落和阅读顺序。日本語ひらがなカタカナABCxyz0123")) & coverage
    for point in samples:
        old_name, new_name = old_map[point], new_map[point]
        a, b = DecomposingRecordingPen(old_glyphs), DecomposingRecordingPen(new_glyphs)
        old_glyphs[old_name].draw(a)
        new_glyphs[new_name].draw(b)
        assert a.value == b.value, "Outline changed: %X" % point
    manifest["fonts"].append({"name": name, "weight": weight,
                             "url": "/assets/fonts/preview/" + target.name,
                             "fullURL": "/assets/fonts/NotoSansSC-" + name + ".woff2",
                             "bytes": len(data), "fullBytes": source.stat().st_size,
                             "sha256": sha, "outlineSamplesChecked": len(samples)})
    print(json.dumps({"weight": weight, "bytes": len(data), "checkedGlyphMetrics": len(coverage), "checkedOutlines": len(samples)}), flush=True)
(destination / "OFL.txt").write_bytes((font_dir / "OFL.txt").read_bytes())
(root / "src/preview-fonts.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
(root / "src/preview-font-data.js").write_text("export default " + json.dumps(manifest, ensure_ascii=False, indent=2) + ";\n", encoding="utf8")
print(json.dumps({"characters": len(coverage), "previewBytes": sum(f["bytes"] for f in manifest["fonts"]),
                  "fullBytes": sum(f["fullBytes"] for f in manifest["fonts"]),
                  "glyphMetrics": "all identical", "sampledOutlines": "identical", "fonts": manifest["fonts"]}))
