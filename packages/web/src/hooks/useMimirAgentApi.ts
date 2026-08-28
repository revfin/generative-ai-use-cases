import { useCallback } from 'react';
import {
  LambdaClient,
  InvokeWithResponseStreamCommand,
} from '@aws-sdk/client-lambda';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-provider-cognito-identity';
import { fetchAuthSession } from 'aws-amplify/auth';
import { StreamingChunk } from 'generative-ai-use-cases';
import {
  AgentDeltaFrame,
  AgentErrorFrame,
  AgentResultFrame,
  AgentSource,
  agentTurnEvent,
  parseAgentFrames,
} from '../utils/agentStream';
import { TurnEvent } from '../utils/turnStatus';

/**
 * The chat's send path when it is pointed at the Mimir agent.
 *
 * The transport is deliberately the same one `predictStream` uses: a direct,
 * SigV4-signed Lambda invocation with the credentials the Cognito identity
 * pool issues to signed-in users, plus the ID token in the payload for the
 * function to verify. See `packages/cdk/lambda/invokeMimirAgent.ts` for why
 * both halves are needed.
 *
 * The agent's SSE frames are translated here into the `StreamingChunk` NDJSON
 * the chat store already consumes, so history, retries, edits, the stop
 * button and the error toasts all keep working through their existing paths.
 */

const region = import.meta.env.VITE_APP_REGION;
const userPoolId = import.meta.env.VITE_APP_USER_POOL_ID;
const idPoolId = import.meta.env.VITE_APP_IDENTITY_POOL_ID;
const functionArn = import.meta.env.VITE_APP_AGENT_RUNTIME_FUNCTION_ARN;

/** Whether the stack was deployed with a Mimir agent runtime behind it. */
export const agentRuntimeEnabled: boolean =
  import.meta.env.VITE_APP_AGENT_RUNTIME_ENABLED === 'true' &&
  !!import.meta.env.VITE_APP_AGENT_RUNTIME_FUNCTION_ARN;

export type AgentTurnHandlers = {
  /** Tool activity, for the status strip. */
  onTurnEvent?: (event: TurnEvent) => void;
  /** The sources of the finished answer, for the footnote list. */
  onSources?: (sources: AgentSource[]) => void;
};

const ERROR_CODES = ['THROTTLING', 'ACCESS_DENIED', 'UNKNOWN_ERROR'] as const;

const toStreamingErrorCode = (code?: string): StreamingChunk['errorCode'] =>
  (ERROR_CODES as readonly string[]).includes(code ?? '')
    ? (code as StreamingChunk['errorCode'])
    : 'UNKNOWN_ERROR';

const useMimirAgentApi = () => {
  /**
   * Invoke the agent Lambda and yield its raw response bytes.
   */
  const invokeAgent = useCallback(async function* (req: {
    prompt: string;
    sessionId: string;
  }) {
    const token = (await fetchAuthSession()).tokens?.idToken?.toString();

    if (!token) {
      throw new Error('Not authenticated');
    }

    const providerName = `cognito-idp.${region}.amazonaws.com/${userPoolId}`;
    const lambda = new LambdaClient({
      region,
      requestHandler: {
        requestTimeout: 300000,
        socketTimeout: 300000,
        connectionTimeout: 10000,
      },
      credentials: fromCognitoIdentityPool({
        clientConfig: { region },
        identityPoolId: idPoolId,
        logins: {
          [providerName]: token,
        },
      }),
    });

    const res = await lambda.send(
      new InvokeWithResponseStreamCommand({
        FunctionName: functionArn,
        Payload: JSON.stringify({ ...req, idToken: token }),
      })
    );

    for await (const event of res.EventStream!) {
      if (event.PayloadChunk?.Payload) {
        yield new TextDecoder('utf-8').decode(event.PayloadChunk.Payload);
      }

      if (event.InvokeComplete) {
        break;
      }
    }
  }, []);

  /**
   * A `StreamingChunk` NDJSON stream, in the exact shape the chat store reads
   * from `predictStream`. Tool frames and the source list leave through the
   * handlers instead of the stream, because neither has a place in the chunk
   * format and neither belongs in the answer text.
   */
  const agentStream = useCallback(
    (prompt: string, sessionId: string, handlers: AgentTurnHandlers = {}) =>
      async function* (): AsyncGenerator<Uint8Array> {
        const encoder = new TextEncoder();
        const encode = (chunk: StreamingChunk) =>
          encoder.encode(`${JSON.stringify(chunk)}\n`);

        let buffer = '';
        let streamedText = false;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const handle = function* (frame: any): Generator<Uint8Array> {
          switch (frame.type) {
            case 'tool': {
              const event = agentTurnEvent(frame);

              if (event) {
                handlers.onTurnEvent?.(event);
              }

              return;
            }

            case 'delta': {
              const text = (frame as AgentDeltaFrame).text ?? '';

              if (text !== '') {
                streamedText = true;
                yield encode({ text });
              }

              return;
            }

            case 'result': {
              const result = frame as AgentResultFrame;

              handlers.onSources?.(result.sources ?? []);

              // The terminal frame repeats the whole answer. It is only the
              // answer when nothing streamed - otherwise emitting it would
              // print the reply twice.
              if (!streamedText && result.text) {
                streamedText = true;
                yield encode({ text: result.text });
              }

              return;
            }

            case 'error': {
              const error = frame as AgentErrorFrame;

              console.error('Mimir agent error frame:', error);

              // `stopReason: 'error'` is what makes the chat store throw and
              // surface the localized toast, exactly as Bedrock errors do
              yield encode({
                text: '',
                stopReason: 'error',
                errorCode: toStreamingErrorCode(error.code),
              });

              return;
            }

            default:
              return;
          }
        };

        for await (const text of invokeAgent({ prompt, sessionId })) {
          buffer += text;

          const { frames, rest } = parseAgentFrames(buffer);
          buffer = rest;

          for (const frame of frames) {
            yield* handle(frame);
          }
        }

        // A stream that ends without a trailing newline still owes us its
        // last frame
        if (buffer.trim() !== '') {
          for (const frame of parseAgentFrames(`${buffer}\n`).frames) {
            yield* handle(frame);
          }
        }
      },
    [invokeAgent]
  );

  return { agentRuntimeEnabled, invokeAgent, agentStream };
};

export default useMimirAgentApi;
