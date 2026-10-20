# Bundled PDF font

`NotoSans-Regular.ttf` is the regular Noto Sans font from the official Noto fonts repository:
https://github.com/notofonts/noto-fonts/blob/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf

The font's embedded copyright notice is `Copyright 2015-2021 Google LLC. All Rights Reserved.` The upstream repository license is the SIL Open Font License 1.1; see the unmodified `OFL.txt`.

Verified SHA-256: `b85c38ecea8a7cfb39c24e395a4007474fa5a4fc864f6ee33309eb4948d232d5`.

The full TTF is intentional: Fontsource's `latin-ext` WOFF excludes basic ASCII, and its `latin` WOFF excludes extended customer names. The PDF module loads this local bundled font only; it never sends quotation data or fetches fonts from a third-party service. Unsupported code points are explicitly rejected before rendering rather than exported as missing glyphs. Noto Sans is not a universal CJK/emoji font.
