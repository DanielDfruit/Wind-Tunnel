# Canvas Video Export Notes

Official references:
- HTMLCanvasElement.captureStream(): https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream
- MediaStream Recording API: https://developer.mozilla.org/en-US/docs/Web/API/MediaStream_Recording_API

Useful facts:
- `canvas.captureStream()` returns a MediaStream containing a real-time capture of the canvas contents.
- The MediaStream Recording API can capture MediaStream data for saving.
- WebM is the realistic first export target in browser/Electron contexts.
- MP4 should not be promised unless a real local conversion pipeline is implemented.

Implementation instruction:
- Add PNG snapshot export first.
- Add WebM export using canvas capture + MediaRecorder.
- During export:
  - lock controls
  - show progress
  - let user choose duration
  - let user choose FPS
  - let user choose quality/resolution if practical
- If 4K export is too demanding, show a warning and suggest 1080p.
