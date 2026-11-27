import { STT_MODELS, DEFAULT_STT_MODEL } from './stt';

// Model ids saved by older versions (server-side @xenova/transformers) → in-browser equivalents
const LEGACY_MODELS = {
  'Xenova/whisper-tiny': 'onnx-community/whisper-base',
  'Xenova/whisper-tiny.en': 'onnx-community/whisper-base',
  'Xenova/whisper-base': 'onnx-community/whisper-base',
  'Xenova/whisper-base.en': 'onnx-community/whisper-base',
  'Xenova/whisper-small': 'onnx-community/whisper-small',
  'Xenova/whisper-small.en': 'onnx-community/whisper-small',
};

/** The speech model to use for a saved setting (handles empty and legacy values). */
export function sttModelFromConfig(saved) {
  if (saved && STT_MODELS.some(m => m.id === saved)) return saved;
  return LEGACY_MODELS[saved] || DEFAULT_STT_MODEL;
}
