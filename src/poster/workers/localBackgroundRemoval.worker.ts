import * as ort from 'onnxruntime-web/wasm';
import wasmModuleUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';
import wasmBinaryUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import {
  inspectAlphaMask,
  localModelInputSize,
  normalizeModelMask,
  rgbaToModelTensor,
  type LocalBackgroundRemovalModel,
} from './localBackgroundRemovalMath';

const workerScope = self as unknown as Worker;
const MAX_OUTPUT_PIXELS = 30_000_000;
const MODEL_CONFIG: Record<LocalBackgroundRemovalModel, { label: string; url: string }> = {
  portrait: {
    label: 'portrait model',
    url: '/models/background-removal/modnet-quantized.onnx',
  },
  general: {
    label: 'general-object model',
    url: '/models/background-removal/u2netp.onnx',
  },
};

type RemoveRequest = {
  type: 'remove';
  id: string;
  model: LocalBackgroundRemovalModel;
  mediaType: string;
  source: ArrayBuffer;
};

const sessionPromises = new Map<LocalBackgroundRemovalModel, Promise<ort.InferenceSession>>();
const loadedSessions = new Set<LocalBackgroundRemovalModel>();

ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.wasm.initTimeout = 30_000;
ort.env.wasm.wasmPaths = {
  mjs: new URL(wasmModuleUrl, self.location.href).href,
  wasm: new URL(wasmBinaryUrl, self.location.href).href,
};

workerScope.addEventListener('message', (event: MessageEvent<RemoveRequest>) => {
  if (event.data?.type !== 'remove') return;
  void removeBackground(event.data);
});

async function removeBackground(request: RemoveRequest): Promise<void> {
  const startedAt = performance.now();
  let bitmap: ImageBitmap | null = null;
  try {
    progress(request.id, 'Preparing image…');
    if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
      throw new Error('This browser does not support local image processing.');
    }

    bitmap = await createImageBitmap(new Blob([request.source], { type: request.mediaType }), {
      imageOrientation: 'from-image',
    });
    if (bitmap.width * bitmap.height > MAX_OUTPUT_PIXELS) {
      throw new Error('The local beta supports images up to 30 megapixels.');
    }

    const inputSize = localModelInputSize(request.model, bitmap.width, bitmap.height);
    const inputCanvas = new OffscreenCanvas(inputSize.width, inputSize.height);
    const inputContext = inputCanvas.getContext('2d', { willReadFrequently: true });
    if (!inputContext) throw new Error('The browser could not prepare the image canvas.');
    inputContext.imageSmoothingEnabled = true;
    inputContext.imageSmoothingQuality = 'high';
    inputContext.drawImage(bitmap, 0, 0, inputSize.width, inputSize.height);
    const pixels = inputContext.getImageData(0, 0, inputSize.width, inputSize.height);
    const inputTensor = new ort.Tensor(
      'float32',
      rgbaToModelTensor(pixels.data, inputSize.width, inputSize.height, request.model),
      [1, 3, inputSize.height, inputSize.width],
    );

    const sessionAlreadyLoaded = loadedSessions.has(request.model);
    progress(
      request.id,
      sessionAlreadyLoaded
        ? `Using cached ${MODEL_CONFIG[request.model].label}…`
        : `Loading ${MODEL_CONFIG[request.model].label} for the first run…`,
    );
    const session = await getSession(request.model);
    progress(request.id, 'Removing background on this device…');
    const outputs = await session.run({ [session.inputNames[0]]: inputTensor });
    const maskTensor = outputs[session.outputNames[0]];
    if (!maskTensor || maskTensor.dims.length < 2) {
      throw new Error('The local model returned an invalid mask.');
    }

    const maskWidth = Number(maskTensor.dims.at(-1));
    const maskHeight = Number(maskTensor.dims.at(-2));
    const maskValues = maskTensor.data;
    if (!(maskValues instanceof Float32Array)) {
      throw new Error('The local model returned an unsupported mask format.');
    }
    if (maskWidth <= 0 || maskHeight <= 0 || maskValues.length < maskWidth * maskHeight) {
      throw new Error('The local model returned an incomplete mask.');
    }
    const alpha = normalizeModelMask(maskValues, request.model);
    const maskInspection = inspectAlphaMask(alpha);
    if (maskInspection.maximum - maskInspection.minimum < 4 || maskInspection.foregroundRatio < 0.001) {
      throw new Error(
        'The local model could not find a clear foreground. Try the other local model or use Remove.bg.',
      );
    }

    progress(request.id, 'Applying transparent edges…');
    const maskCanvas = new OffscreenCanvas(maskWidth, maskHeight);
    const maskContext = maskCanvas.getContext('2d');
    if (!maskContext) throw new Error('The browser could not prepare the transparency mask.');
    const maskPixels = new Uint8ClampedArray(maskWidth * maskHeight * 4);
    for (let index = 0; index < alpha.length; index += 1) {
      const offset = index * 4;
      maskPixels[offset] = 255;
      maskPixels[offset + 1] = 255;
      maskPixels[offset + 2] = 255;
      maskPixels[offset + 3] = alpha[index];
    }
    maskContext.putImageData(new ImageData(maskPixels, maskWidth, maskHeight), 0, 0);

    const outputCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const outputContext = outputCanvas.getContext('2d');
    if (!outputContext) throw new Error('The browser could not create the transparent image.');
    outputContext.drawImage(bitmap, 0, 0);
    outputContext.globalCompositeOperation = 'destination-in';
    outputContext.imageSmoothingEnabled = true;
    outputContext.imageSmoothingQuality = 'high';
    outputContext.drawImage(maskCanvas, 0, 0, bitmap.width, bitmap.height);

    const output = await outputCanvas.convertToBlob({ type: 'image/webp', quality: 0.96 });
    const outputBuffer = await output.arrayBuffer();
    workerScope.postMessage(
      {
        type: 'result',
        id: request.id,
        model: request.model,
        mediaType: output.type || 'image/webp',
        elapsedMs: Math.round(performance.now() - startedAt),
        firstLoad: !sessionAlreadyLoaded,
        output: outputBuffer,
      },
      [outputBuffer],
    );
  } catch (error) {
    workerScope.postMessage({
      type: 'error',
      id: request.id,
      message: error instanceof Error ? error.message : 'Local background removal failed.',
    });
  } finally {
    bitmap?.close();
  }
}

function getSession(model: LocalBackgroundRemovalModel): Promise<ort.InferenceSession> {
  const existing = sessionPromises.get(model);
  if (existing) return existing;

  const config = MODEL_CONFIG[model];
  const modelUrl = new URL(config.url, self.location.origin).href;
  const pending = ort.InferenceSession.create(modelUrl, {
    executionProviders: ['wasm'],
    executionMode: 'sequential',
    graphOptimizationLevel: 'all',
  })
    .then((session) => {
      loadedSessions.add(model);
      return session;
    })
    .catch((error) => {
      sessionPromises.delete(model);
      throw error;
    });
  sessionPromises.set(model, pending);
  return pending;
}

function progress(id: string, message: string): void {
  workerScope.postMessage({ type: 'progress', id, message });
}
