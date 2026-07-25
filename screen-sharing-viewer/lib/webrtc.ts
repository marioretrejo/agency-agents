export const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302'] },
  { urls: ['stun:stun1.l.google.com:19302'] },
  // Add a TURN relay for restrictive NATs (later).
];

export async function setupPeerConnection(): Promise<RTCPeerConnection> {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  // Codec fallback (VP8 → H264 → VP9) is negotiated by the host's offer;
  // browsers answer with the first mutually supported codec.
  return pc;
}

/**
 * Apply the host's offer and produce an answer.
 * Returns the local description to send back through signaling.
 */
export async function answerOffer(
  pc: RTCPeerConnection,
  offer: RTCSessionDescriptionInit,
): Promise<RTCSessionDescriptionInit> {
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  if (!pc.localDescription) {
    throw new Error('[Viewer] localDescription missing after createAnswer');
  }
  return pc.localDescription.toJSON();
}
