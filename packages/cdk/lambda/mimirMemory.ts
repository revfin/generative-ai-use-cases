import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  BedrockAgentCoreClient,
  ListMemoryRecordsCommand,
  GetMemoryRecordCommand,
  DeleteMemoryRecordCommand,
  MemoryRecordSummary,
} from '@aws-sdk/client-bedrock-agentcore';

/**
 * The user-facing memory manager: what Mimir remembers about the caller, and
 * the ability to delete it.
 *
 * Unlike `invokeMimirAgent.ts` (a direct, SigV4-signed Lambda invocation with
 * no API Gateway in front of it), this function sits behind API Gateway's
 * Cognito User Pool authorizer - the same one every other authed route in
 * this stack uses (see `chats`, `systemcontexts`, ...). API Gateway has
 * already verified the caller's ID token by the time this code runs, so
 * `event.requestContext.authorizer.claims.sub` is exactly as trustworthy as
 * the manually-verified `sub` in `invokeMimirAgent.ts` - it is still the
 * ONLY source of the actor id. The client never supplies one.
 *
 * A user's long-term memory lives in exactly two AgentCore Memory
 * namespaces, both keyed by their verified sub:
 *   /mimir/preferences/{actorId}
 *   /mimir/facts/{actorId}
 * Session events / chat history are a different concern entirely and this
 * function never touches them - "forget everything" wipes long-term memory
 * only.
 */

const MEMORY_ID = process.env.MEMORY_ID ?? '';

const client = new BedrockAgentCoreClient({});

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

const json = (
  statusCode: number,
  body: Record<string, unknown>
): APIGatewayProxyResult => ({
  statusCode,
  headers: corsHeaders,
  body: JSON.stringify(body),
});

const empty = (statusCode: number): APIGatewayProxyResult => ({
  statusCode,
  headers: corsHeaders,
  body: '',
});

const namespacesFor = (actorId: string): string[] => [
  `/mimir/preferences/${actorId}`,
  `/mimir/facts/${actorId}`,
];

type MemoryRecord = {
  recordId: string;
  namespace: string;
  content: string;
  createdAt: string | null;
};

const toRecord = (
  summary: MemoryRecordSummary,
  fallbackNamespace: string
): MemoryRecord => ({
  recordId: summary.memoryRecordId!,
  namespace: summary.namespaces?.[0] ?? fallbackNamespace,
  content: summary.content?.text ?? '',
  createdAt: summary.createdAt ? summary.createdAt.toISOString() : null,
});

/** Every record in one namespace, following `nextToken` to the end. */
const listNamespace = async (namespace: string): Promise<MemoryRecord[]> => {
  const records: MemoryRecord[] = [];
  let nextToken: string | undefined;

  do {
    const res = await client.send(
      new ListMemoryRecordsCommand({
        memoryId: MEMORY_ID,
        namespace,
        maxResults: 100,
        nextToken,
      })
    );

    for (const summary of res.memoryRecordSummaries ?? []) {
      records.push(toRecord(summary, namespace));
    }

    nextToken = res.nextToken;
  } while (nextToken);

  return records;
};

const listAll = async (actorId: string): Promise<MemoryRecord[]> => {
  const perNamespace = await Promise.all(
    namespacesFor(actorId).map(listNamespace)
  );
  return perNamespace.flat();
};

/** Does this record actually belong to one of the caller's own namespaces? */
const ownsRecord = async (
  actorId: string,
  recordId: string
): Promise<boolean> => {
  try {
    const res = await client.send(
      new GetMemoryRecordCommand({
        memoryId: MEMORY_ID,
        memoryRecordId: recordId,
      })
    );
    const namespaces = res.memoryRecord?.namespaces ?? [];
    const allowed = new Set(namespacesFor(actorId));
    return namespaces.some((ns) => allowed.has(ns));
  } catch (error) {
    if (error instanceof Error && error.name === 'ResourceNotFoundException') {
      return false;
    }
    throw error;
  }
};

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    if (MEMORY_ID === '') {
      console.error('MEMORY_ID is not configured');
      return json(500, { message: 'Memory is not configured.' });
    }

    const actorId = event.requestContext.authorizer?.claims?.sub;

    if (!actorId) {
      return json(401, { message: 'Not authenticated.' });
    }

    const recordId = event.pathParameters?.recordId;

    if (event.httpMethod === 'GET' && !recordId) {
      const records = await listAll(actorId);
      return json(200, { records });
    }

    if (event.httpMethod === 'DELETE' && recordId) {
      // Never delete blind: a recordId from another user's memory 404s,
      // exactly as if it never existed.
      if (!(await ownsRecord(actorId, recordId))) {
        return json(404, { message: 'Not found.' });
      }

      await client.send(
        new DeleteMemoryRecordCommand({
          memoryId: MEMORY_ID,
          memoryRecordId: recordId,
        })
      );

      return empty(204);
    }

    if (event.httpMethod === 'DELETE' && !recordId) {
      const records = await listAll(actorId);

      const results = await Promise.allSettled(
        records.map((record) =>
          client.send(
            new DeleteMemoryRecordCommand({
              memoryId: MEMORY_ID,
              memoryRecordId: record.recordId,
            })
          )
        )
      );

      const deletedRecords = results.filter(
        (result) => result.status === 'fulfilled'
      ).length;

      const failed = results.length - deletedRecords;
      if (failed > 0) {
        console.error(`Failed to delete ${failed} memory record(s)`);
      }

      return json(200, { deletedRecords });
    }

    return json(404, { message: 'Not found.' });
  } catch (error) {
    console.error('mimirMemory failed:', error);
    return json(500, { message: 'Internal Server Error' });
  }
};
