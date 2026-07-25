'use client';

/**
 * Renders the incoming WebRTC stream onto a <canvas>. The MediaStream is
 * attached to a hidden, muted, playsInline <video> (required for iOS Safari
 * autoplay) and frames are copied to the canvas — this avoids fullscreen
 * hijacking and sizing quirks of raw <video> on mobile browsers.
 */
import { useEffect, useRef } from 'react';

export default function Viewer({ stream }: { stream: MediaStream }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

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
    videoRef.current = video;

    video.play().catch((err) => {
      console.error('[Viewer] video.play() failed', err);
    });

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
      videoRef.current = null;
    };
  }, [stream]);

  return (
    <div className="viewer-canvas-wrap">
      <canvas ref={canvasRef} aria-label="Shared screen" />
    </div>
  );
}
