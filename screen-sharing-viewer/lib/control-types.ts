/**
 * Control-channel protocol. These JSON messages travel over the WebRTC
 * DataChannel between viewer and host, alongside the video stream.
 *
 * The same definitions live in the host project (src/control-types.ts);
 * keep them in sync if you change the wire format.
 */

export interface KeyModifiers {
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
}

export type MouseButtonName = 'left' | 'middle' | 'right';

// Viewer -> Host
export interface ControlRequestMsg {
  t: 'request';
  /** Optional unattended-access password. */
  password?: string;
}
export interface MouseMoveMsg { t: 'mouse-move'; x: number; y: number }
export interface MouseButtonMsg {
  t: 'mouse-button';
  button: MouseButtonName;
  down: boolean;
  x: number;
  y: number;
}
export interface ScrollMsg { t: 'scroll'; dx: number; dy: number }
export interface KeyMsg {
  t: 'key';
  code: string;
  key: string;
  down: boolean;
  modifiers: KeyModifiers;
}
export interface TextMsg { t: 'text'; value: string }

// Host -> Viewer
export interface GrantedMsg { t: 'granted' }
export interface DeniedMsg { t: 'denied'; reason: string }
export interface RevokedMsg { t: 'revoked' }

// Either direction
export interface ClipboardMsg { t: 'clipboard'; value: string }

export type ViewerToHostMsg =
  | ControlRequestMsg
  | MouseMoveMsg
  | MouseButtonMsg
  | ScrollMsg
  | KeyMsg
  | TextMsg
  | ClipboardMsg;

export type HostToViewerMsg = GrantedMsg | DeniedMsg | RevokedMsg | ClipboardMsg;

export type ControlMsg = ViewerToHostMsg | HostToViewerMsg;
