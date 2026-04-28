# Third-Party Notices

This project is an iOS frontend and native bridge for local KataGo analysis.
The project license in `LICENSE` applies to code in this repository unless a
file states otherwise. Third-party projects, libraries, and model files remain
under their own licenses.

## KataGo

KataGo is developed by David J. Wu ("lightvector") and contributors. KataGo
source code is distributed under an MIT-style license.

Upstream:

- https://github.com/lightvector/KataGo
- https://github.com/lightvector/KataGo/blob/master/LICENSE

If you redistribute a binary containing KataGo-derived code or linked KataGo
libraries, keep the upstream copyright and permission notice with the
distribution.

## Sabaki

Sabaki is developed by Yichuan Shen and contributors. Sabaki is distributed
under the MIT License.

Upstream:

- https://github.com/SabakiHQ/Sabaki
- https://github.com/SabakiHQ/Sabaki/blob/master/LICENSE.md

This project is not the official Sabaki app.

## KataGo neural networks and zhizi networks

KataGo neural network files are not committed to this repository. Users may
download compatible `.bin.gz` or `.txt.gz` networks separately and import them
into the app.

The public KataGo training site publishes network license information here:

- https://katagotraining.org/network_license/
- https://katagotraining.org/networks/kata1/

Do not assume this repository's MIT license covers separately downloaded model
files. Preserve the applicable network license when redistributing model files.

## KataGo third-party dependencies

KataGo includes additional third-party dependency notices, including CLBlast
(Apache License 2.0), filesystem, half, httplib, nlohmann_json, tclap, Mozilla
CA certificates, and SHA2-derived code. When updating or redistributing the
native KataGo framework, include the corresponding upstream notices from the
KataGo source tree.
