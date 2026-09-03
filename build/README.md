# App icon

Drop your own icon files here and `npm run electron:build` picks them up
automatically -- electron-builder looks for exactly these names, no config
change needed:

| File | Platform | Format |
| --- | --- | --- |
| `icon.ico` | Windows | multi-resolution `.ico` (16-256px) |
| `icon.icns` | macOS | `.icns` |
| `icon.png` | Linux | 512x512 (or larger) `.png` |

Until one is added, the packaged app uses Electron's own default icon --
harmless, just generic. A 1024x1024 PNG run through an "icon generator" tool
(many free ones online, or `electron-icon-builder`) will produce all three
formats from one source image.
