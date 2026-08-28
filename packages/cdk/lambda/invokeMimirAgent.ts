import { Handler, Context } from 'aws-lambda';
import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
} from '@aws-sdk/client-bedrock-agentcore';
import { verifyToken } from './utils/auth';

/**
 * Browser -> Mimir agent, with the caller's identity established server side.
 *
 * The trust model is the one `predictStream.ts` already uses, and it has two
 * independent halves:
 *
 *  1. *Who may call this function at all* is IAM. The browser signs the
 *     invocation with SigV4 using the credentials the Cognito **identity
 *     pool** hands to authenticated users, and the CDK grants
 *     `lambda:InvokeFunction` on this function to that authenticated role
 *     only. An unauthenticated visitor cannot reach the function.
 *
 *  2. *Which user is calling* is the ID token. The identity-pool role is
 *     shared by every signed-in user, so it says "an employee", never "which
 *     employee". The client therefore also puts its Cognito ID token in the
 *     payload and this function verifies it against the user pool's JWKS
 *     (issuer, audience and `token_use` all checked by `aws-jwt-verify`)
 *     before trusting a single byte of it.
 *
 * `actor_id` is taken from the verified token's `sub` and from nowhere else -
 * a client-supplied actor id would be a free identity swap, and the agent uses
 * it for attribution. No token, or a token that fails verification, ends the
 * turn: this fails closed.
 */

type InvokeMimirAgentRequest = {
  prompt?: string;
  sessionId?: string;
  idToken?: string;
};

declare global {
  namespace awslambda {
    function streamifyResponse(
      f: (
        event: InvokeMimirAgentRequest,
        responseStream: NodeJS.WritableStream,
        context: Context
      ) => Promise<void>
    ): Handler;
  }
}

// AgentCore rejects a runtime session id shorter than 33 characters, and only
// accepts this alphabet. The client already sends a conforming id; this is the
// backstop, and it is deterministic so a padded id stays stable across turns.
const SESSION_ID_MIN_LENGTH = 33;
const SESSION_ID_MAX_LENGTH = 100;

export const toRuntimeSessionId = (raw: string): string => {
  const safe = raw
    .replace(/[^A-Za-z0-9_-]/g, '-')
    .slice(0, SESSION_ID_MAX_LENGTH);

  return safe.length >= SESSION_ID_MIN_LENGTH
    ? safe
    : safe.padEnd(SESSION_ID_MIN_LENGTH, '0');
};

/** `arn:aws:bedrock-agentcore:<region>:<account>:runtime/<id>` */
export const regionOfRuntimeArn = (arn: string): string | undefined =>
  arn.split(':')[3] || undefined;

const frame = (payload: Record<string, unknown>): string =>
  `data: ${JSON.stringify(payload)}\n\n`;

export const handler = awslambda.streamifyResponse(
  async (
    event: InvokeMimirAgentRequest,
    responseStream: NodeJS.WritableStream,
    context: Context
  ) => {
    context.callbackWaitsForEmptyEventLoop = false;

    const fail = (code: string, message: string) => {
      responseStream.write(frame({ type: 'error', code, message }));
      responseStream.end();
    };

    const runtimeArn = process.env.AGENT_RUNTIME_ARN ?? '';

    if (runtimeArn === '') {
      console.error('AGENT_RUNTIME_ARN is not configured');
      fail('NOT_CONFIGURED', 'The agent runtime is not configured.');
      return;
    }

    // Half two of the trust model: prove which user this is, or stop.
    const claims = await verifyToken(event.idToken ?? '');

    if (!claims?.sub) {
      console.warn('Rejected an invocation with no verifiable ID token');
      fail('UNAUTHORIZED', 'Not authenticated.');
      return;
    }

    const prompt = (event.prompt ?? '').trim();

    if (prompt === '') {
      fail('EMPTY_PROMPT', 'The prompt is empty.');
      return;
    }

    const sessionId = toRuntimeSessionId(event.sessionId ?? claims.sub);

    try {
      const client = new BedrockAgentCoreClient({
        region: regionOfRuntimeArn(runtimeArn) ?? process.env.AWS_REGION,
      });

      const response = await client.send(
        new InvokeAgentRuntimeCommand({
          agentRuntimeArn: runtimeArn,
          runtimeSessionId: sessionId,
          qualifier: 'DEFAULT',
          contentType: 'application/json',
          accept: 'text/event-stream',
          payload: JSON.stringify({
            prompt,
            session_id: sessionId,
            // Entra group filtering lands with the SSO work; until then the
            // agent applies no ACL narrowing rather than a fabricated one.
            acl_groups: [],
            actor_id: claims.sub,
          }),
        })
      );

      const stream = response.response;

      if (!stream) {
        fail('EMPTY_RESPONSE', 'The agent returned no response.');
        return;
      }

      // The frames are the agent's contract with the browser: pass them
      // through byte for byte rather than re-encoding a wire format twice.
      for await (const chunk of stream as AsyncIterable<Uint8Array>) {
        responseStream.write(Buffer.from(chunk));
      }

      responseStream.end();
    } catch (e) {
      console.error('InvokeAgentRuntime failed:', e);
      const name = e instanceof Error ? e.name : '';
      const code =
        name === 'ThrottlingException'
          ? 'THROTTLING'
          : name === 'AccessDeniedException'
            ? 'ACCESS_DENIED'
            : 'UNKNOWN_ERROR';
      fail(code, 'The agent could not answer this turn.');
    }
  }
);
