export interface VideoExportProgress {
  phase: 'recording' | 'done' | 'error';
  progress: number;
  message: string;
}

export async function captureCanvasPng(canvas: HTMLCanvasElement): Promise<string> {
  return canvas.toDataURL('image/png');
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

export async function recordCanvasWebM(
  canvas: HTMLCanvasElement,
  options: { durationSec: number; fps: number },
  onProgress?: (p: VideoExportProgress) => void
): Promise<Blob> {
  const fps = options.fps;
  const durationMs = options.durationSec * 1000;
  const stream = canvas.captureStream(fps);
  const mimeTypes = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const mimeType = mimeTypes.find((m) => MediaRecorder.isTypeSupported(m)) ?? 'video/webm';

  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  return new Promise((resolve, reject) => {
    recorder.onerror = () => reject(new Error('MediaRecorder error'));
    recorder.onstop = () => {
      onProgress?.({ phase: 'done', progress: 100, message: 'Complete' });
      resolve(new Blob(chunks, { type: mimeType }));
    };
    recorder.start(100);
    const start = performance.now();
    const tick = (): void => {
      const elapsed = performance.now() - start;
      const pct = Math.min(100, (elapsed / durationMs) * 100);
      onProgress?.({ phase: 'recording', progress: pct, message: `Recording ${pct.toFixed(0)}%` });
      if (elapsed < durationMs) requestAnimationFrame(tick);
      else {
        recorder.stop();
        stream.getTracks().forEach((t) => t.stop());
      }
    };
    requestAnimationFrame(tick);
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
