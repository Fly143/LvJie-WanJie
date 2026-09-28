// 薄桥接：re-export LLM，避免 event 与 llm 环
export {
  callLLM,
  extractGameJSON,
  narrativeFromStream,
  normalizeApiKey,
  endpointOf,
  maskKey,
  listModels
} from './llm.js'
