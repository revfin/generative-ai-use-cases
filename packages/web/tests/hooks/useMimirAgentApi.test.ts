import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { StreamingChunk } from 'generative-ai-use-cases';
import { AgentSource } from '../../src/utils/agentStream';
import { TurnEvent } from '../../src/utils/turnStatus';

/**
 * The agent send path, from the bytes on the wire to the frames the chat
 * store consumes. The Lambda transport is stubbed; everything above it -
 * SSE reassembly, tool events, delta text, the source list, error frames -
 * is the real code.
 */

const sent: { FunctionName?: string; Payload?: string }[] = [];
let responseChunks: string[] = [];

vi.mock('aws-amplify/auth', () => ({
  fetchAuthSession: async () => ({
    tokens: { idToken: { toString: () => 'an-id-token' } },
  }),
}));

vi.mock('@aws-sdk/credential-provider-cognito-identity', () => ({
  fromCognitoIdentityPool: () => async () => ({
    accessKeyId: 'a',
    secretAccessKey: 'b',
  }),
}));

vi.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: class {
    async send(command: {
      input: { FunctionName?: string; Payload?: string };
    }) {
      sent.push(command.input);

      const encoder = new TextEncoder();

      return {
        EventStream: (async function* () {
          for (const chunk of responseChunks) {
            yield { PayloadChunk: { Payload: encoder.encode(chunk) } };
          }
          yield { InvokeComplete: {} };
        })(),
      };
    }
  },
  InvokeWithResponseStreamCommand: class {
    constructor(public input: { FunctionName?: string; Payload?: string }) {}
  },
}));

const sse = (frames: object[]) =>
  frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join('');

const collect = async (
  frames: object[],
  chunking: (stream: string) => string[] = (stream) => [stream]
) => {
  responseChunks = chunking(sse(frames));

  const events: TurnEvent[] = [];
  let sources: AgentSource[] | undefined;

  const useMimirAgentApi = (await import('../../src/hooks/useMimirAgentApi'))
    .default;
  const { result } = renderHook(() => useMimirAgentApi());

  const stream = result.current.agentStream('why?', 'a-session-id', {
    onTurnEvent: (event: TurnEvent) => events.push(event),
    onSources: (next: AgentSource[]) => {
      sources = next;
    },
  });

  const chunks: StreamingChunk[] = [];
  const decoder = new TextDecoder();

  for await (const bytes of stream()) {
    for (const line of decoder.decode(bytes).trim().split('\n')) {
      chunks.push(JSON.parse(line) as StreamingChunk);
    }
  }

  return { chunks, events, sources };
};

beforeEach(() => {
  sent.length = 0;
  responseChunks = [];
  vi.stubEnv('VITE_APP_AGENT_RUNTIME_ENABLED', 'true');
  vi.stubEnv(
    'VITE_APP_AGENT_RUNTIME_FUNCTION_ARN',
    'arn:aws:lambda:x:1:f:agent'
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('agent stream', () => {
  it('turns a full turn into chunks, status events and a source list', async () => {
    const sources: AgentSource[] = [
      {
        marker: 'src-1',
        number: 1,
        title: 'Policy.pdf',
        uri: 's3://d/Policy.pdf',
      },
    ];

    const {
      chunks,
      events,
      sources: seen,
    } = await collect([
      { type: 'tool', name: 'search_documents', status: 'running' },
      { type: 'tool', name: 'search_documents', status: 'succeeded', count: 2 },
      { type: 'delta', text: 'Caps ' },
      { type: 'delta', text: 'apply.[^src-1]' },
      { type: 'result', text: 'Caps apply.[^src-1]', sources },
    ]);

    // Tool frames leave through the status strip, never the answer text
    expect(events).toEqual([
      { type: 'retrieve-start' },
      { type: 'retrieve-settled', count: 2 },
    ]);
    expect(chunks).toEqual([{ text: 'Caps ' }, { text: 'apply.[^src-1]' }]);
    expect(seen).toEqual(sources);
  });

  it('reassembles frames split across payload chunks', async () => {
    const { chunks } = await collect(
      [
        { type: 'delta', text: 'one ' },
        { type: 'delta', text: 'two' },
      ],
      (stream) => stream.match(/.{1,7}/gs) ?? []
    );

    expect(chunks).toEqual([{ text: 'one ' }, { text: 'two' }]);
  });

  it('uses the terminal text only when nothing streamed', async () => {
    const { chunks } = await collect([
      { type: 'tool', name: 'search_documents', status: 'running' },
      { type: 'result', text: 'The whole answer.', sources: [] },
    ]);

    expect(chunks).toEqual([{ text: 'The whole answer.' }]);
  });

  it('surfaces an error frame as the stop reason the chat store already handles', async () => {
    const { chunks } = await collect([
      { type: 'delta', text: 'partial' },
      { type: 'error', code: 'THROTTLING', message: 'slow down' },
    ]);

    expect(chunks).toEqual([
      { text: 'partial' },
      { text: '', stopReason: 'error', errorCode: 'THROTTLING' },
    ]);
  });

  it('maps an unrecognised error code onto the generic one', async () => {
    const { chunks } = await collect([
      { type: 'error', code: 'RUNTIME_ON_FIRE' },
    ]);

    expect(chunks[0].errorCode).toBe('UNKNOWN_ERROR');
  });

  it('sends the prompt, the session id and the id token for the function to verify', async () => {
    await collect([{ type: 'delta', text: 'hi' }]);

    expect(sent).toHaveLength(1);
    expect(sent[0].FunctionName).toBe('arn:aws:lambda:x:1:f:agent');
    expect(JSON.parse(sent[0].Payload!)).toEqual({
      prompt: 'why?',
      sessionId: 'a-session-id',
      idToken: 'an-id-token',
    });
  });
});

describe('the agent flag', () => {
  const reload = async () => {
    vi.resetModules();
    return await import('../../src/hooks/useMimirAgentApi');
  };

  it('is off when the stack was deployed without an agent runtime', async () => {
    vi.stubEnv('VITE_APP_AGENT_RUNTIME_ENABLED', 'false');
    vi.stubEnv('VITE_APP_AGENT_RUNTIME_FUNCTION_ARN', '');

    expect((await reload()).agentRuntimeEnabled).toBe(false);
  });

  it('stays off when the flag is on but no function was deployed', async () => {
    vi.stubEnv('VITE_APP_AGENT_RUNTIME_ENABLED', 'true');
    vi.stubEnv('VITE_APP_AGENT_RUNTIME_FUNCTION_ARN', '');

    expect((await reload()).agentRuntimeEnabled).toBe(false);
  });

  it('is on only with both halves present', async () => {
    vi.stubEnv('VITE_APP_AGENT_RUNTIME_ENABLED', 'true');
    vi.stubEnv(
      'VITE_APP_AGENT_RUNTIME_FUNCTION_ARN',
      'arn:aws:lambda:x:1:f:agent'
    );

    expect((await reload()).agentRuntimeEnabled).toBe(true);
  });
});
