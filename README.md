# HyperChat Fork: Lite + Flow

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Contributors](https://img.shields.io/github/contributors/LiveTL/HyperChat)](https://github.com/LiveTL/HyperChat/contributors)
[![Issues](https://img.shields.io/github/issues/LiveTL/HyperChat)](https://github.com/LiveTL/HyperChat/issues)
![Size](https://img.shields.io/github/repo-size/LiveTL/HyperChat)
[![Commit Activity](https://img.shields.io/github/commit-activity/w/LiveTL/HyperChat)](https://github.com/LiveTL/HyperChat/commits/)
[![Discord](https://img.shields.io/discord/780938154437640232.svg?label=&logo=discord&logoColor=ffffff&color=7389D8&labelColor=6A7EC2)](https://discord.gg/uJrV3tmthg)

## Acknowledgements

This project is maintained as a fork of HyperChat by LiveTL.

For the video flow-comment feature, we also referenced ideas and behavior from:

- youtube-live-chat-flow: https://github.com/fiahfy/youtube-live-chat-flow

Thanks to the original authors and contributors of both projects.

## About This Fork

This repository is a fork-based derivative focused on:

- Keeping HyperChat's lightweight chat rendering behavior.
- Adding a video overlay "flow chat" mode for YouTube watch pages.
- Allowing YouTube chat comments (including emoji/stickers) to flow on top of the video.

In short: this is a HyperChat-derived build with additional on-video flow-comment support.

## Install

Recommended: use prebuilt release artifacts.

1. Open this repository's **Releases** page.
2. Download:
   - `HyperChat-Fork-Lite-Flow-chrome.zip` for Chrome/Edge
   - `HyperChat-Fork-Lite-Flow-firefox.zip` for Firefox
3. Extract the ZIP.
4. Load unpacked extension:
   - Chrome/Edge: `chrome://extensions` -> enable Developer mode -> **Load unpacked** -> select extracted folder.
   - Firefox: `about:debugging#/runtime/this-firefox` -> **Load Temporary Add-on** -> select `manifest.json` in extracted folder.

You can also build locally if needed.


## Building from Source

### ⚠️ WARNING ⚠️

For legacy reasons, we have a `mv2` branch used by [the LiveTL extension](https://github.com/LiveTL/LiveTL)'s Manifest V2 Firefox variant, while the `main` branch houses the main Manifest V3 version that's published to stores.

### Development

> Note: The repo expects a Linux or Unix-like environment. If you are on Windows, use WSL.

Clone your fork repository:

```bash
git clone https://github.com/<your-account>/<your-repo>
```

Open the repository and npm install:

```bash
cd HyperChat
npm install # install dependencies
```

Serve the extension for local development:

```bash
npm run dev:chrome    # devserver for Chrome extension
npm run dev:firefox   # devserver for Firefox extension

npm run start:chrome  # devserver + open extension in Chrome
npm run start:firefox # devserver + open extension in Firefox
```

### Building for Production

Our build script is [an automated GitHub action](.github/workflows/release.yml), where `${{ github.ref }}` should evaluate to a tag in the format `vX.Y.Z` (where `X.Y.Z` is the version number).

To simulate the build:

```bash
VERSION=X.Y.Z npm run build         # Chrome & Firefox
VERSION=X.Y.Z npm run build:chrome  # just Chrome
VERSION=X.Y.Z npm run build:firefox # just Firefox
```

The built ZIP files can be found in the `build` directory.

## Why not commit built files to git?

Built outputs are usually distributed via Releases, not committed into source history, because:

- Source history stays small and reviewable.
- Built files are reproducible from source and lockfiles.
- Release artifacts can be replaced per version without polluting code diffs.

For users, Releases are still one-step install (download ZIP and load unpacked).
