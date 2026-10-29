// Shared local embedder: all-MiniLM-L6-v2 (384-dim, mean-pooled + normalized).
import { pipeline } from '@huggingface/transformers'

export const DIM = 384
let _pipe = null
export async function getPipe() {
  if (!_pipe) _pipe = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
  return _pipe
}
export async function embed(texts) {
  const pipe = await getPipe()
  const out = await pipe(texts, { pooling: 'mean', normalize: true })
  return out.tolist()
}
export const toVec = (a) => '[' + a.join(',') + ']'
export const clip = (s, n) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n) || '(empty)'
