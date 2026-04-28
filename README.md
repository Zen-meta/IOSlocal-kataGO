# Go AI Review iOS

This is an open-source iOS frontend port track for a Sabaki-style local KataGo
app.

Go AI Review runs KataGo locally on iPhone through Metal. It is not the
official KataGo app, not the official Sabaki app, and it does not include neural
network model files in this repository.

## Download and install

There is no App Store build yet. The normal way to try this repository today is
to build it with Xcode and install it on your own iPhone.

Requirements:

- macOS with Xcode installed
- An Apple ID signed in to Xcode
- iOS 16.0 or newer
- A connected iPhone, or an iOS Simulator for UI smoke testing

Clone the repository:

```sh
git clone https://github.com/Zen-meta/IOSlocal-kataGO.git
cd IOSlocal-kataGO
```

Open the project:

```sh
open KataGoSabakiIOS.xcodeproj
```

In Xcode:

1. Select the `KataGoSabakiIOS` target.
2. Open `Signing & Capabilities`.
3. Select your Apple development team.
4. Change the placeholder bundle identifier `com.example.goaireview` to a
   unique identifier such as `com.yourname.goaireview`.
5. Connect your iPhone, select it as the run destination, and press `Run`.

For a command-line build without signing:

```sh
xcodebuild \
  -project KataGoSabakiIOS.xcodeproj \
  -target KataGoSabakiIOS \
  -configuration Debug \
  -sdk iphoneos \
  -arch arm64 \
  CODE_SIGNING_ALLOWED=NO \
  build
```

That command only verifies the device build. Installing on a physical iPhone
still requires Xcode signing.

## First run

The repository does not bundle KataGo neural networks. On first launch, import a
model before starting analysis:

1. Open the app.
2. In the `Model` panel, tap `Model Site` to open the KataGo network page, or
   download a model separately from:

   ```text
   https://katagotraining.org/networks/kata1/
   ```

3. Save a `.bin.gz` or `.txt.gz` KataGo model to the iOS Files app.
4. Return to Go AI Review and tap `Import`.
5. Select the downloaded model file.
6. Pick the imported model in the model selector and tap `Select`.
7. Turn `Engine On`.

Large models are slower and use more memory. For testing, start with a smaller
or medium KataGo network before trying very large b40-class networks.

## IPA and releases

GitHub release assets can provide source archives or developer-oriented build
artifacts, but an iPhone cannot normally install an arbitrary downloaded `.ipa`
unless it is signed for that device or distributed through an Apple-supported
channel such as TestFlight, App Store, Ad Hoc provisioning, Xcode, Apple
Configurator, or an approved organization deployment flow.

If a release includes an `.ipa`, treat it as a convenience artifact for
developers or testers who understand iOS signing. For regular users, App Store
or TestFlight is the clean installation path.

The original Sabaki project is Electron/Node based. Its renderer can be reused
conceptually, but the desktop engine integration cannot run unchanged on iOS
because it depends on Electron IPC, Node file APIs, and spawning GTP engine
processes. This iOS version uses:

- SwiftUI as the native app shell
- `WKWebView` for the board UI
- A static Web frontend under `KataGoSabakiIOS/Web`
- `WKScriptMessageHandler` for JavaScript to Swift messages
- The existing `KatagoMobile.xcframework` for native KataGo Metal inference

## Simulator smoke test

Run:

```sh
./run_simulator.sh
```

The app starts with persistent analysis enabled by default. The smoke passes
when native logs contain:

```text
Go AI Review analyze top=...
```

Current migrated core features:

- Tap on the board to play at the current game-tree node.
- `Undo` moves back to the parent node.
- Playing a different move after undo creates a branch.
- `Game Tree` lists the current move tree and lets you jump between nodes.
- `Engine On` calls native KataGo and shows candidate moves with winrate, visits,
  score lead, prior, and PV.
- Inference uses the mobile Metal backend through `KatagoMobile.xcframework`.
  The Swift bridge chooses search visits, time limit, search threads, neural-net
  batch size, and NN cache size from the active model size, available device
  memory, detected CPU/GPU profile, Low Power Mode, and thermal state. On
  A18/A18 Pro class iPhones the bridge exposes the 2P+4E CPU layout, GPU core
  count, and 16-core Neural Engine in the hardware panel for device context.
  Inference is Metal-only; ANE/Core ML paths were removed because mixed-precision
  behavior was not reliable enough for release.
- The `Engine` panel exposes global Fast / Balanced / Strong presets and
  advanced visits, time, thread, batch, and cache
  controls. Visits can be typed directly up to the native bridge limit. User
  selections are persisted locally and clamped by the native
  bridge to the current device and model's safe range.
- `Online` mode keeps the engine running in repeated short analysis slices and
  refreshes candidates after each slice. Visits and time controls are disabled in
  this mode; the native bridge ignores manual visits/time and uses the preset to
  choose the refresh slice. Playing a move interrupts the current slice and
  restarts analysis from the new position. `Play Game` remains separate and does
  not use online analysis.
- Analysis defaults to a next-move heatmap with candidate winrates, without
  auto-opening the first PV.
- Selecting a candidate from the analysis list draws its variation on the board
  with numbered ghost stones. Board taps always play a move.
- `Engine On` keeps analysis running on the current position after each new move,
  like Sabaki's persistent analysis workflow.
- `Model` lists imported models. Model binaries are not committed to this
  repository because KataGo networks are large. Users can download models from
  `https://katagotraining.org/networks/kata1/` in Safari and import them through
  the iOS document picker as `.bin.gz` or `.txt.gz` files. `Select` is the only
  step that switches the active engine model. Imported models are kept under the
  app's Application Support directory and remain available after restarting the
  app.
- The app has no monetization gate or game-count limit. All game modes are
  available locally after a model is imported.
- The `Legal` section includes third-party license notes for the in-app
  acknowledgements.
- `Play Game` starts a basic human-vs-KataGo mode. The human side can be
  switched between black and white in the `Game` panel; if the human is white,
  KataGo makes the opening move.
- `Pass` records a pass move and ends the game after two consecutive passes.
- `Resign` ends the current game without sending a resign move to KataGo.
- Board play now applies frontend legality checks for occupied points, captures,
  suicide, and simple ko recapture.
- `Play` inserts the selected KataGo candidate into the current game tree.
- `Winrate` draws a compact graph from stored node evaluations and the current
  top candidate.
- SGF export preserves branches from the current tree model.

## Model files

The `KataGoSabakiIOS/Models/` folder is intentionally kept out of Git except
for a placeholder. To test with a bundled model during local development, place
a KataGo `.bin.gz` or `.txt.gz` network in that folder before building. Bundled
and imported models are detected by extension only.

Recommended public model index:

```text
https://katagotraining.org/networks/kata1/
```

Large model files should be distributed separately from this Git repository.

## License

This repository is released under the MIT License. See `LICENSE`.

Third-party components and model files keep their own licenses. See
`THIRD_PARTY_NOTICES.md` before redistributing binaries or model files.

Next frontend migration steps:

- Replace the vanilla canvas board with Sabaki's `@sabaki/shudan` once npm
  package fetching is stable on this machine.
- Move SGF parsing/export from the current minimal implementation to
  `@sabaki/sgf`.
- Add automatic model metadata discovery from katagotraining instead of using a
  hard-coded strongest-model URL.
- Expand `Play Game` with richer clock or rules controls while keeping the iOS
  native KataGo bridge instead of desktop GTP child processes.
