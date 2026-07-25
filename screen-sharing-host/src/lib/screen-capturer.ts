/**
 * Multi-platform screen capture. Runs in the renderer process.
 *
 * Primary path (Windows / macOS / Linux X11): Electron's desktopCapturer,
 * exposed via preload IPC, consumed through the Chromium
 * `chromeMediaSourceId` constraint.
 *
 * Fallback (e.g. Linux Wayland where source enumeration can fail):
 * getDisplayMedia(), which main.ts answers via setDisplayMediaRequestHandler.
 */

const FRAME_RATE_MAX = 30;

function log(message: string, ...rest: unknown[]): void {
  console.log(`[Host] ${message}`, ...rest);
}

export async function captureScreen(): Promise<MediaStream> {
  try {
    const sources = await window.electronAPI.getScreenSources();
    if (sources.length === 0) {
      throw new Error('desktopCapturer returned no screen sources');
    }
    const primary = sources[0]; // primary display
    log(`capturing "${primary.name}" via desktopCapturer`);

    // Chromium-specific constraints; not part of the standard TS lib types.
    const constraints = {
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: primary.id,
          maxFrameRate: FRAME_RATE_MAX,
        },
      },
    } as unknown as MediaStreamConstraints;

    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    log('desktopCapturer path failed, falling back to getDisplayMedia()', err);
    try {
      return await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { max: FRAME_RATE_MAX } },
        audio: false,
      });
    } catch (fallbackErr) {
      log('getDisplayMedia() fallback also failed', fallbackErr);
      throw new Error('Screen capture failed on this platform');
    }
  }
}

export function stopStream(stream: MediaStream | null): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    track.stop();
  }
}
