# “小胡不当牛马”桌面品牌与图标 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Windows 桌面端用户可见名称统一为“小胡不当牛马”，并生成透明外围、紫蓝双色、负空间隐藏 H 的多尺寸图标。

**Architecture:** 保留现有 Electron、electron-builder 和 Pillow 生成链路，只修改用户可见桌面文案与确定性图标绘制函数。Node 测试锁定品牌文案和技术标识边界，Python 图像测试锁定 ICO 帧、透明四角、双片颜色及中央分隔。

**Tech Stack:** Electron、electron-builder、Node.js `node:test`、Python 3、Pillow

## Global Constraints

- 用户可见桌面名称必须精确为“小胡不当牛马”。
- `name: "xiaohutodo"`、`appId: "com.xiaohu.todo"`、发布 URL、Cloudflare 名称、数据库名与 Cookie 名不得修改。
- 图标仅使用左片 `#5B4CF0`、右片 `#8B7CFF` 和透明背景。
- 图标不得包含底板、渐变、阴影、描边或外发光。
- ICO 必须包含 16、24、32、48、64、128、256 像素帧。
- 最终图标必须由 `scripts/generate-desktop-icon.py` 确定性生成，不直接使用 AI 生图文件。

---

### Task 1: Desktop display name

**Files:**
- Create: `tests/desktop-branding.test.js`
- Modify: `package.json`
- Modify: `desktop/main.cjs`

**Interfaces:**
- Consumes: `package.json` electron-builder 配置和 `desktop/main.cjs` 用户可见字符串。
- Produces: 安装器、快捷方式、窗口和托盘统一显示“小胡不当牛马”；技术标识保持原值。

- [ ] **Step 1: Write the failing branding test**

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const desktopMain = readFileSync(new URL('../desktop/main.cjs', import.meta.url), 'utf8');

test('desktop surfaces use the new product name', () => {
  assert.equal(packageJson.description, '小胡不当牛马 Windows desktop shell');
  assert.equal(packageJson.build.productName, '小胡不当牛马');
  assert.equal(packageJson.build.nsis.shortcutName, '小胡不当牛马');
  assert.match(desktopMain, /title: '小胡不当牛马'/);
  assert.match(desktopMain, /tray\.setToolTip\('小胡不当牛马'\)/);
  assert.match(desktopMain, /`小胡不当牛马 - 下载更新 \$\{Math\.round\(progress\.percent\)\}%`/);
  assert.doesNotMatch(desktopMain, /小胡 Todo/);
});

test('desktop technical identity remains stable', () => {
  assert.equal(packageJson.name, 'xiaohutodo');
  assert.equal(packageJson.build.appId, 'com.xiaohu.todo');
  assert.equal(packageJson.build.publish.url, 'https://xiaohutodo.pages.dev/desktop-updates/');
});
```

- [ ] **Step 2: Run the branding test and verify it fails**

Run: `node --test tests/desktop-branding.test.js`

Expected: FAIL because `package.json` and `desktop/main.cjs` still contain “小胡 Todo”.

- [ ] **Step 3: Replace only user-visible desktop branding**

In `package.json`, set:

```json
"description": "小胡不当牛马 Windows desktop shell",
"productName": "小胡不当牛马",
"shortcutName": "小胡不当牛马"
```

In `desktop/main.cjs`, replace the four tray tooltip strings and the BrowserWindow title with “小胡不当牛马”, preserving the existing update percentage suffix.

- [ ] **Step 4: Run the branding test and syntax check**

Run: `node --test tests/desktop-branding.test.js`

Expected: 2 tests pass.

Run: `node --check desktop/main.cjs`

Expected: exit code 0 with no syntax errors.

- [ ] **Step 5: Commit the branding change**

```bash
git add tests/desktop-branding.test.js package.json desktop/main.cjs
git commit -m "feat: rename desktop app"
```

### Task 2: Deterministic two-piece H icon

**Files:**
- Create: `tests/desktop_icon_test.py`
- Modify: `scripts/generate-desktop-icon.py`
- Modify: `build/app.ico`
- Modify: `build/app-icon-preview.png`
- Modify: `icon.ico`

**Interfaces:**
- Consumes: `draw_icon(size: int) -> PIL.Image.Image` and the palette constants `LEFT_COLOR`, `RIGHT_COLOR`.
- Produces: deterministic RGBA raster frames and identical desktop/web ICO assets.

- [ ] **Step 1: Write the failing icon tests**

```python
import importlib.util
import struct
import unittest
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "generate-desktop-icon.py"


def load_generator():
    spec = importlib.util.spec_from_file_location("desktop_icon_generator", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class DesktopIconTest(unittest.TestCase):
    def test_draw_icon_uses_only_two_brand_colors_and_transparency(self):
        generator = load_generator()
        image = generator.draw_icon(256).convert("RGBA")
        colors = {pixel[:3] for pixel in image.getdata() if pixel[3]}
        self.assertEqual(colors, {generator.LEFT_COLOR[:3], generator.RIGHT_COLOR[:3]})
        self.assertEqual(image.getpixel((0, 0))[3], 0)
        self.assertEqual(image.getpixel((255, 255))[3], 0)

    def test_small_icons_keep_a_transparent_center_gap(self):
        generator = load_generator()
        for size in (16, 24, 32):
            image = generator.draw_icon(size).convert("RGBA")
            middle = [image.getpixel((size // 2, y))[3] for y in range(size // 3, 2 * size // 3)]
            self.assertIn(0, middle, f"{size}px center gap closed")

    def test_generated_ico_contains_all_required_sizes(self):
        generator = load_generator()
        generator.generate_assets()
        data = (ROOT / "build" / "app.ico").read_bytes()
        _, image_type, count = struct.unpack_from("<HHH", data, 0)
        self.assertEqual(image_type, 1)
        widths = {data[6 + index * 16] or 256 for index in range(count)}
        self.assertEqual(widths, {16, 24, 32, 48, 64, 128, 256})
        self.assertEqual((ROOT / "build" / "app.ico").read_bytes(), (ROOT / "icon.ico").read_bytes())


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the icon tests and verify they fail**

Run: `python -m unittest tests/desktop_icon_test.py -v`

Expected: FAIL because the old generator has no palette constants or `generate_assets()` and produces the old calendar icon.

- [ ] **Step 3: Replace the icon drawing implementation**

Replace `scripts/generate-desktop-icon.py` with:

```python
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
BUILD_DIR = ROOT / "build"
BUILD_DIR.mkdir(exist_ok=True)

LEFT_COLOR = (91, 76, 240, 255)
RIGHT_COLOR = (139, 124, 255, 255)
SIZES = (16, 24, 32, 48, 64, 128, 256)
SUPERSAMPLE = 8


def _box(size, values):
    return tuple(round(value * size) for value in values)


def _piece_mask(size, stem_box, tab_box):
    work_size = size * SUPERSAMPLE
    mask = Image.new("L", (work_size, work_size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle(
        _box(work_size, stem_box),
        radius=round(work_size * 0.075),
        fill=255,
    )
    draw.rounded_rectangle(
        _box(work_size, tab_box),
        radius=round(work_size * 0.025),
        fill=255,
    )
    mask = mask.rotate(
        -6,
        resample=Image.Resampling.BICUBIC,
        center=(work_size / 2, work_size / 2),
    )
    return mask.resize((size, size), Image.Resampling.LANCZOS)


def draw_icon(size):
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    left_mask = _piece_mask(
        size,
        stem_box=(0.18, 0.15, 0.40, 0.84),
        tab_box=(0.34, 0.45, 0.47, 0.55),
    )
    right_mask = _piece_mask(
        size,
        stem_box=(0.60, 0.22, 0.82, 0.89),
        tab_box=(0.53, 0.45, 0.66, 0.55),
    )
    left_layer = Image.new("RGBA", (size, size), LEFT_COLOR)
    right_layer = Image.new("RGBA", (size, size), RIGHT_COLOR)
    left_layer.putalpha(left_mask)
    right_layer.putalpha(right_mask)
    image.alpha_composite(left_layer)
    image.alpha_composite(right_layer)
    return image


def generate_assets():
    images = [draw_icon(size) for size in SIZES]
    images[-1].save(BUILD_DIR / "app.ico", sizes=[(size, size) for size in SIZES])
    images[-1].save(BUILD_DIR / "app-icon-preview.png")
    (ROOT / "icon.ico").write_bytes((BUILD_DIR / "app.ico").read_bytes())


if __name__ == "__main__":
    generate_assets()
```

- [ ] **Step 4: Run the generator and icon tests**

Run: `python scripts/generate-desktop-icon.py`

Expected: `build/app.ico`, `build/app-icon-preview.png`, and `icon.ico` are generated.

Run: `python -m unittest tests/desktop_icon_test.py -v`

Expected: 3 tests pass.

- [ ] **Step 5: Inspect the generated preview**

Open `build/app-icon-preview.png` against light and dark backgrounds. Confirm the shape is two separated purple pieces, the negative-space H is visible without becoming a typed letter, and there are no fringes, shadows, glows, or background tile.

- [ ] **Step 6: Run the complete project verification**

Run: `npm test`

Expected: all Node tests pass, including `tests/desktop-branding.test.js`.

Run: `npm run check`

Expected: all JavaScript syntax checks pass.

Run: `npm run desktop:build`

Expected: NSIS and portable Windows artifacts build successfully with the new product name and icon.

- [ ] **Step 7: Commit the icon change**

```bash
git add tests/desktop_icon_test.py scripts/generate-desktop-icon.py build/app.ico build/app-icon-preview.png icon.ico
git commit -m "feat: refresh desktop app icon"
```
