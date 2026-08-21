# Local background-removal models

These models are used only by the optional browser-side background-removal beta.
Images and model inputs stay on the user's device.

| File | Purpose | Source | SHA-256 | License |
| --- | --- | --- | --- | --- |
| `modnet-quantized.onnx` | Portrait matting | `Xenova/modnet`, quantized ONNX export of MODNet | `92e49898c3e05a6d7a944fc67a8cb87c4aad754ffb6ebd949528c7d1105fee3a` | Apache-2.0 |
| `u2netp.onnx` | General salient-object segmentation | `edgetools/u2netp`, mirrored from `danielgatis/rembg` / U²-Net | `309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8` | Apache-2.0 |

Source pages:

- https://huggingface.co/Xenova/modnet
- https://huggingface.co/edgetools/u2netp
- https://github.com/ZHKKKe/MODNet
- https://github.com/xuebinqin/U-2-Net

Do not replace either binary without reviewing the upstream license and updating
the pinned hash in this file.
