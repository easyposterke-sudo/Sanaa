# Local background-removal models

This model powers EasyPoster's primary selected-image background remover.
Images and model inputs stay on the user's device.

| File | Purpose | Source | SHA-256 | License |
| --- | --- | --- | --- | --- |
| `u2netp.onnx` | General salient-object segmentation | `edgetools/u2netp`, mirrored from `danielgatis/rembg` / U²-Net | `309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8` | Apache-2.0 |

Source pages:

- https://huggingface.co/edgetools/u2netp
- https://github.com/xuebinqin/U-2-Net

Do not replace the binary without reviewing the upstream license and updating
the pinned hash in this file.
