import { runUploadedPine, type PineRequest } from './pine-runtime';
self.onmessage = async (event: MessageEvent<PineRequest>) => {
  try { self.postMessage({ value: await runUploadedPine(event.data) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : String(error) }); }
};
