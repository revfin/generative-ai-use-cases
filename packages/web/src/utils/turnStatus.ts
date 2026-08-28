/**
 * The status strip shown where an answer is about to appear.
 *
 * Every phase here maps to something that actually happened on the wire -
 * retrieval started, retrieval came back with N passages, reasoning tokens are
 * streaming, answer tokens are streaming. There is no timer-driven theatre: if
 * nothing real is happening the machine sits in `waiting` and the caller falls
 * back to the plain cursor.
 *
 * Pure on purpose, so the transitions can be tested without a browser.
 */

export type TurnPhase =
  | 'idle'
  | 'waiting'
  | 'searching'
  | 'reading'
  | 'thinking'
  | 'answering';

export type TurnStatus = {
  phase: TurnPhase;
  sourceCount: number;
};

export type TurnEvent =
  | { type: 'turn-start' }
  | { type: 'retrieve-start' }
  | { type: 'retrieve-settled'; count: number }
  | { type: 'reasoning' }
  | { type: 'answer' }
  | { type: 'turn-end' };

export const IDLE_TURN_STATUS: TurnStatus = { phase: 'idle', sourceCount: 0 };

const WAITING_TURN_STATUS: TurnStatus = { phase: 'waiting', sourceCount: 0 };

/** Phases where the answer has begun; nothing may pull the strip backwards. */
const isSettled = (phase: TurnPhase) =>
  phase === 'answering' || phase === 'idle';

/**
 * Advance the strip. Returns the same object when an event changes nothing, so
 * React can bail out of the re-render.
 */
export const nextTurnStatus = (
  state: TurnStatus,
  event: TurnEvent
): TurnStatus => {
  switch (event.type) {
    case 'turn-end':
      return state.phase === 'idle' ? state : IDLE_TURN_STATUS;

    case 'turn-start':
      return state.phase === 'waiting' ? state : WAITING_TURN_STATUS;

    case 'retrieve-start':
      // A retrieval that starts after the answer began belongs to no turn we
      // are still drawing
      if (isSettled(state.phase)) {
        return state;
      }
      return state.phase === 'searching'
        ? state
        : { phase: 'searching', sourceCount: 0 };

    case 'retrieve-settled':
      // Only the retrieval we announced may resolve the strip
      if (state.phase !== 'searching') {
        return state;
      }
      // Zero hits is a non-event: the turn is simply an ordinary conversation
      return event.count > 0
        ? { phase: 'reading', sourceCount: event.count }
        : WAITING_TURN_STATUS;

    case 'reasoning':
      if (isSettled(state.phase) || state.phase === 'thinking') {
        return state;
      }
      return { phase: 'thinking', sourceCount: state.sourceCount };

    case 'answer':
      if (state.phase === 'idle' || state.phase === 'answering') {
        return state;
      }
      return { phase: 'answering', sourceCount: state.sourceCount };

    default:
      return state;
  }
};

/** Whether the strip has something honest to say right now. */
export const hasTurnStatusLabel = (status?: TurnStatus): boolean =>
  status?.phase === 'searching' ||
  status?.phase === 'reading' ||
  status?.phase === 'thinking';
