# AMO source build

This archive contains the human-readable source needed to reproduce the Firefox extension package.

## Requirements

- Ubuntu 24.04 or macOS
- Node.js 24.14.0
- npm 11.9.0
- `zip` and `unzip`

## Reproduce the extension archive

```sh
npm ci
npm run package:extension
unzip -q apps/extension/nowsze-horyzonty-extension.zip -d packaged-extension
diff -ru --exclude=content.js.map apps/extension/dist packaged-extension
```

The comparison has no output when the generated extension files match. `content.js.map` is not part of the release ZIP. The source archive itself is generated with `npm run package:extension` and is supplied to AMO using `web-ext sign --upload-source-code`.
