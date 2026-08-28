import { describe, expect, it } from 'vitest';
import {
  IDLE_TURN_STATUS,
  TurnEvent,
  TurnStatus,
  hasTurnStatusLabel,
  nextTurnStatus,
} from '../../src/utils/turnStatus';

const run = (events: TurnEvent[], from: TurnStatus = IDLE_TURN_STATUS) =>
  events.reduce(nextTurnStatus, from);

describe('turn status machine', () => {
  it('walks a grounded turn from retrieval to answer', () => {
    const start = run([{ type: 'turn-start' }]);
    expect(start).toEqual({ phase: 'waiting', sourceCount: 0 });

    const searching = nextTurnStatus(start, { type: 'retrieve-start' });
    expect(searching.phase).toBe('searching');

    const reading = nextTurnStatus(searching, {
      type: 'retrieve-settled',
      count: 3,
    });
    expect(reading).toEqual({ phase: 'reading', sourceCount: 3 });

    const thinking = nextTurnStatus(reading, { type: 'reasoning' });
    expect(thinking).toEqual({ phase: 'thinking', sourceCount: 3 });

    const answering = nextTurnStatus(thinking, { type: 'answer' });
    expect(answering).toEqual({ phase: 'answering', sourceCount: 3 });

    expect(nextTurnStatus(answering, { type: 'turn-end' })).toBe(
      IDLE_TURN_STATUS
    );
  });

  it('says nothing when retrieval finds nothing', () => {
    const settled = run([
      { type: 'turn-start' },
      { type: 'retrieve-start' },
      { type: 'retrieve-settled', count: 0 },
    ]);

    expect(settled).toEqual({ phase: 'waiting', sourceCount: 0 });
    expect(hasTurnStatusLabel(settled)).toBe(false);
  });

  it('reaches thinking without any retrieval', () => {
    expect(run([{ type: 'turn-start' }, { type: 'reasoning' }])).toEqual({
      phase: 'thinking',
      sourceCount: 0,
    });
  });

  it('never moves backwards once the answer is streaming', () => {
    const answering = run([
      { type: 'turn-start' },
      { type: 'retrieve-start' },
      { type: 'retrieve-settled', count: 2 },
      { type: 'answer' },
    ]);

    for (const event of [
      { type: 'reasoning' },
      { type: 'retrieve-start' },
      { type: 'retrieve-settled', count: 5 },
    ] as TurnEvent[]) {
      expect(nextTurnStatus(answering, event)).toBe(answering);
    }
  });

  it('ignores a retrieval that resolves outside its own phase', () => {
    const thinking = run([{ type: 'turn-start' }, { type: 'reasoning' }]);

    expect(
      nextTurnStatus(thinking, { type: 'retrieve-settled', count: 4 })
    ).toBe(thinking);
  });

  it('returns the same object when an event changes nothing', () => {
    const searching = run([{ type: 'turn-start' }, { type: 'retrieve-start' }]);

    expect(nextTurnStatus(searching, { type: 'retrieve-start' })).toBe(
      searching
    );
    expect(nextTurnStatus(IDLE_TURN_STATUS, { type: 'turn-end' })).toBe(
      IDLE_TURN_STATUS
    );
  });

  it('drops everything on turn-end and restarts clean', () => {
    const ended = run([
      { type: 'turn-start' },
      { type: 'retrieve-start' },
      { type: 'retrieve-settled', count: 3 },
      { type: 'turn-end' },
    ]);

    expect(ended).toBe(IDLE_TURN_STATUS);
    expect(nextTurnStatus(ended, { type: 'turn-start' })).toEqual({
      phase: 'waiting',
      sourceCount: 0,
    });
  });

  it('only labels the phases that have something to report', () => {
    expect(hasTurnStatusLabel(undefined)).toBe(false);
    expect(hasTurnStatusLabel(IDLE_TURN_STATUS)).toBe(false);
    expect(hasTurnStatusLabel({ phase: 'waiting', sourceCount: 0 })).toBe(
      false
    );
    expect(hasTurnStatusLabel({ phase: 'answering', sourceCount: 1 })).toBe(
      false
    );
    expect(hasTurnStatusLabel({ phase: 'searching', sourceCount: 0 })).toBe(
      true
    );
    expect(hasTurnStatusLabel({ phase: 'reading', sourceCount: 2 })).toBe(true);
    expect(hasTurnStatusLabel({ phase: 'thinking', sourceCount: 0 })).toBe(
      true
    );
  });
});
