export const APP_VERSION = '10';
export const PROGRESS_KEY = 'klotski-progress-v1';

export const DEMO_MOVE_MS = 300;
export const TRACKING_GAIN = 1.5;
export const SWIPE_THRESHOLD = 10;
export const FLICK_VELOCITY = 0.4;
export const MIN_FLICK_DISTANCE = 6;
export const MIN_DRAG_DURATION = 50;
export const AXIS_LOCK = 4;
export const PRE_AXIS_FOLLOW = 0.9;
export const DRAG_SCALE = 1.03;
export const SNAP_BACK_MS = 80;

export const DIRS = {
  up: { dc: 0, dr: -1 },
  down: { dc: 0, dr: 1 },
  left: { dc: -1, dr: 0 },
  right: { dc: 1, dr: 0 },
};