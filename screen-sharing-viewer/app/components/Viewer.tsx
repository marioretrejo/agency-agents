'use client';

/**
 * Renders the incoming WebRTC stream onto a <canvas>. The MediaStream is
 * attached to a hidden, muted, playsInline <video> (required for iOS Safari
 * autoplay) and frames are copied to the canvas — this avoids fullscreen
 * hijacking and sizing quirks of raw <video> on mobile browsers.
 *
 * When `controlActive` is true, pointer / wheel / keyboard events over the
 * canvas are normalized (coordinates in [0,1] relative to the displayed frame)
 * and forwarded via `onInput` to the host for OS-level injection.
 */
import { useEffect, useRef } from 'react';
import type { MouseButtonName, ViewerToHostMsg } from '@/lib/control-types';

interface ViewerProps {
  stream: MediaStream;
  controlActive: boolean;
  onInput: (msg: ViewerToHostMsg) => void;
}

const BUTTON_NAME: Record<number, MouseButtonName> = { 0: 'left', 1: 'middle', 2: 'right' };

export default function Viewer({ stream, controlActive, onInput }: ViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onInputRef = useRef(onInput);
  onInputRef.current = onInput;

  // --- Render loop: copy video frames to the canvas ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.srcObject = stream;

    video.play().catch((err) => console.error('[Viewer] video.play() failed', err));

    let rafId = 0;
    const draw = () => {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth || 1280;
          canvas.height = video.videoHeight || 720;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
      rafId = requestAnimationFrame(draw);
    };
    rafId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafId);
      video.pause();
      video.srcObject = null;
    };
  }, [stream]);

  // --- Input capture: forward events to the host while controlling ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !controlActive) return;

    const normalize = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const x = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
      const y = rect.height > 0 ? (clientY - rect.top) / rect.height : 0;
      return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
    };

    // Coalesce high-frequency moves to one per animation frame.
    let pendingMove: { x: number; y: number } | null = null;
    let moveRaf = 0;
    const flushMove = () => {
      moveRaf = 0;
      if (pendingMove) {
        onInputRef.current({ t: 'mouse-move', x: pendingMove.x, y: pendingMove.y });
        pendingMove = null;
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      pendingMove = normalize(e.clientX, e.clientY);
      if (!moveRaf) moveRaf = requestAnimationFrame(flushMove);
    };
    const onPointerDown = (e: PointerEvent) => {
      canvas.focus();
      const { x, y } = normalize(e.clientX, e.clientY);
      onInputRef.current({
        t: 'mouse-button',
        button: BUTTON_NAME[e.button] ?? 'left',
        down: true,
        x,
        y,
      });
    };
    const onPointerUp = (e: PointerEvent) => {
      const { x, y } = normalize(e.clientX, e.clientY);
      onInputRef.current({
        t: 'mouse-button',
        button: BUTTON_NAME[e.button] ?? 'left',
        down: false,
        x,
        y,
      });
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      onInputRef.current({ t: 'scroll', dx: e.deltaX, dy: e.deltaY });
    };
    const onContextMenu = (e: Event) => e.preventDefault();

    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      // Don't hijack the browser's own devtools/refresh combos.
      if (e.key === 'F5' || (e.ctrlKey && e.shiftKey && e.key === 'I')) return;
      e.preventDefault();
      onInputRef.current({
        t: 'key',
        code: e.code,
        key: e.key,
        down,
        modifiers: { ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey },
      });
    };
    const onKeyDown = onKey(true);
    const onKeyUp = onKey(false);

    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      if (moveRaf) cancelAnimationFrame(moveRaf);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [controlActive]);

  return (
    <div className="viewer-canvas-wrap">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        className={controlActive ? 'controlling' : ''}
        aria-label="Shared screen"
      />
    </div>
  );
}
