import { PreTokenGenerationV2TriggerEvent } from 'aws-lambda';

/**
 * Cognito Pre Token Generation (V2) trigger.
 *
 * The Mimir governance API authorizes with ACCESS tokens and takes tenant authority from the
 * signed custom:tenant_id claim. Cognito only surfaces custom attributes in ID tokens on its
 * own, so this trigger copies the attribute into the access token at issue time. Users without
 * the attribute get an unmodified token — the governance API then rejects them, which is the
 * correct failure for an unprovisioned user.
 */
export const handler = async (
  event: PreTokenGenerationV2TriggerEvent
): Promise<PreTokenGenerationV2TriggerEvent> => {
  const tenantId = event.request.userAttributes['custom:tenant_id'];
  if (tenantId) {
    event.response.claimsAndScopeOverrideDetails = {
      accessTokenGeneration: {
        claimsToAddOrOverride: { 'custom:tenant_id': tenantId },
      },
    };
  }
  return event;
};
