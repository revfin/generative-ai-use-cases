import * as cdk from 'aws-cdk-lib';
import {
  StackInput,
  stackInputSchema,
  ProcessedStackInput,
} from './lib/stack-input';
import { ModelConfiguration } from 'generative-ai-use-cases';
import { loadBrandingConfig } from './branding';

// Get parameters from CDK Context
const getContext = (app: cdk.App): StackInput => {
  const params = stackInputSchema.parse(app.node.getAllContext());
  return params;
};

// If you want to define parameters directly
const envs: Record<string, Partial<StackInput>> = {
  // If you want to define an anonymous environment, uncomment the following and the content of cdk.json will be ignored.
  // If you want to define an anonymous environment in parameter.ts, uncomment the following and the content of cdk.json will be ignored.
  // '': {
  //   // Parameters for anonymous environment
  //   // If you want to override the default settings, add the following
  // },
  dev: {
    // ---------------------------------------------------------------------
    // Account / region — revfin-dev, single-region ap-south-1 (coordinator
    // constraint). GenU splits "app plane region" (`region`) from "model /
    // KB / agent plane region" (`modelRegion`) — we pin both to ap-south-1
    // so decision #14 (data at rest in ap-south-1) and the region-research
    // finding (AgentCore, KB, S3 Vectors, Transcribe all live in ap-south-1)
    // hold without needing cross-region inference profiles for storage.
    // Model INVOCATION still uses global.* cross-region inference profile
    // IDs below — that's Bedrock routing compute, not data residency, and
    // is exactly what #14's compliance sign-off (open item #1) covers.
    account: '211125585828',
    region: 'ap-south-1',
    modelRegion: 'ap-south-1', // KB + AgentCore deploy into this region (see gap notes below)

    // ---------------------------------------------------------------------
    // Networking — NO VPC KEYS SET, DELIBERATELY.
    //
    // GenU's default (non-closed-network) deployment mode is entirely
    // VPC-less: API Gateway, Cognito, DynamoDB, S3, CloudFront and the
    // Lambdas behind them never reference a VPC unless closedNetworkMode
    // is on. There is no generic top-level `vpcId` import key for the main
    // stack — see schema-gaps section of the report for the full trace.
    // Leaving closedNetworkMode false (its own default) and not setting
    // agentCoreVpcId/agentCoreSubnetIds means this stack creates ZERO
    // networking resources — no VPC, no NAT, no endpoints, no security
    // groups. That already satisfies "reuse existing VPC / no new
    // networking" by not touching networking at all. Do NOT set
    // closedNetworkVpcId to vpc-0ea26d5059b5b9349 — see gap notes, it does
    // not mean what it sounds like it means.
    closedNetworkMode: false,

    // ---------------------------------------------------------------------
    // Models — global.* cross-region inference profiles (#20). Mumbai
    // (ap-south-1) is not in any Bedrock geo-profile (us/eu/apac/jp/au), so
    // region-prefixed IDs (us.anthropic..., apac.anthropic...) will fail
    // GenU's own modelRegion-prefix-match validation, and in-region
    // (unprefixed) Anthropic model IDs don't exist for ap-south-1. global.*
    // is the only form that resolves. Confirmed accepted as-is — see report.
    modelIds: [
      'global.anthropic.claude-sonnet-5', // Sonnet-class: agent/RAG (#20)
      'global.anthropic.claude-haiku-4-5-20251001-v1:0', // Haiku-class: cheap paths — titles, classification (#20)
    ],

    // Image/Video generation: out of the launch scope (#15 lists
    // chat + RAG + MCP + admin + voice — no image/video gen). Empty arrays
    // disable these use cases without touching hiddenUseCases, and avoid
    // requesting Bedrock model access for Nova Canvas/Reel in a region
    // where we haven't verified availability.
    imageGenerationModelIds: [],
    videoGenerationModelIds: [],

    // Voice Chat (bidirectional Nova Sonic conversation) is a DIFFERENT
    // feature from Transcribe (#16 wants Transcribe input only, Polly
    // output "optional" i.e. not now). Empty array disables Voice Chat;
    // Transcribe is a separate always-available construct, see below.
    speechToSpeechModelIds: [],

    // ---------------------------------------------------------------------
    // RAG — Knowledge Base with S3 Vectors backend, Kendra off (#5, cost
    // posture: no OpenSearch/Kendra idle floor).
    ragEnabled: false, // Kendra RAG — off (#5)
    ragKnowledgeBaseEnabled: true, // Bedrock KB RAG — on (#5)
    ragKnowledgeBaseStorageType: 's3vectors', // pay-per-use, no fixed fee (#5)
    ragKnowledgeBaseId: null, // let GenU create the KB
    ragKnowledgeBaseStandbyReplicas: false, // n/a for s3vectors backend; keep false regardless (single-AZ, lowest cost)
    // FM parsing ON from day one (Avinash, 2026-08-28): lending corpora are
    // scan-heavy (signed/stamped agreements) and rate tables are the product —
    // the default text-layer parser returns nothing for scans and flattens
    // tables. Haiku 4.5 as parser = per-page token cost (~fractions of a cent),
    // one-time per document version. BDA-as-KB-parser is us-west-2 preview
    // only — not an option in ap-south-1. Parsing page images transit global
    // inference (same compliance scope as chat).
    ragKnowledgeBaseAdvancedParsing: true,
    ragKnowledgeBaseAdvancedParsingModelId:
      'global.anthropic.claude-haiku-4-5-20251001-v1:0',
    embeddingModelId: 'amazon.titan-embed-text-v2:0', // Titan Text Embeddings V2, IN-REGION ap-south-1 (no global.* prefix — embeddings are invoked directly in modelRegion, not via cross-region inference profile)
    rerankingModelId: null,
    queryDecompositionEnabled: false,

    // ---------------------------------------------------------------------
    // Agent (Bedrock Agents / Code Interpreter — the OLD agent framework).
    // Mimir uses Strands on AgentCore Runtime instead (#11), so this whole
    // block stays off permanently, not just "for now".
    agentEnabled: false, // #11 — bring our own AgentCore runtime later, not Bedrock Agents
    searchAgentEnabled: false,
    inlineAgents: false,

    // AgentCore Runtime — the *generic* runtime GenU can deploy for you.
    // We do NOT want this: it ships GenU's own default MCP toolset
    // (AWS-service + time tools), not Mimir's governance retrieval tool.
    // Mimir's Strands runtime (Phase 3, decisions #10-#12) is built and
    // deployed OUTSIDE this fork, then wired in as an external runtime:
    createGenericAgentCoreRuntime: false, // #11 — do not deploy GenU's generic runtime
    agentBuilderEnabled: false,
    // agentCoreRegion: null,             // null -> falls back to modelRegion (ap-south-1) once used
    //
    // Phase 3 future state (uncomment once the Strands runtime is built +
    // deployed and you have its ARN — this is how "agent import" works):
    // agentCoreExternalRuntimes: [
    //   {
    //     name: 'MimirGovernanceAgent',
    //     display_name: 'Mimir',
    //     description: 'Strands agent with governance-filtered KB retrieval (#11).',
    //     arn: 'arn:aws:bedrock-agentcore:ap-south-1:211125585828:runtime/<runtime-id>',
    //   },
    // ],
    // If/when AgentCore Runtime ever needs PRIVATE VPC networking (not
    // needed for an external-runtime import — only for a GenU-managed
    // runtime), the two keys below take an already-created VPC by ID and
    // RAW subnet IDs with NO tag/type filtering (see report):
    // agentCoreVpcId: 'vpc-0ea26d5059b5b9349',
    // agentCoreSubnetIds: ['subnet-xxxxxxxx', 'subnet-yyyyyyyy'],

    // Mimir's own Strands runtime, deployed out of band (services/agent,
    // decisions #10-#12). Setting this ARN creates the InvokeMimirAgent
    // Lambda and flips the chat's send path over to the agent; unset (null)
    // the chat keeps the client-side retrieve-then-inject path. This is NOT
    // agentCoreExternalRuntimes above - that key only adds a runtime to
    // GenU's own AgentCore chat page, which is not the Mimir chat.
    agentRuntimeArn:
      'arn:aws:bedrock-agentcore:ap-south-1:211125585828:runtime/mimir_agent_dev-cJz7rOEu4i',

    // The AgentCore Memory resource behind that runtime. Setting this id
    // creates the MimirMemory Lambda and the /mimir-memory routes, giving
    // signed-in users their own "what Mimir remembers about me" panel.
    agentCoreMemoryId: 'mimir_agent_dev_memory-4DG20X23s8',
    // The dev pool got custom:tenant_id before the stack managed it; Cognito
    // cannot re-add an attribute, so dev opts out of schema ownership.
    mimirTenantAttribute: false,

    // ---------------------------------------------------------------------
    // MCP chat use case — deprecated upstream (scheduled removal in v6) and
    // superseded by AgentCore Gateway in our design (#10, Phase 3). Leave
    // off permanently, not just until Phase 3.
    mcpEnabled: false,

    // Research Agent — unused. createResearchAgentFargate in particular
    // would deploy a STANDING Fargate service — a real idle-cost violation
    // of the zero-idle posture. Keep both false.
    researchAgentEnabled: false,
    createResearchAgentFargate: false,

    // ---------------------------------------------------------------------
    // Auth — bootstrap ordering per docs/runbooks/entra-sso.md: deploy #1
    // with SAML OFF to create the Cognito user pool + domain, harvest the
    // three values (Entity ID / ACS URL / Logout URL), configure the Entra
    // enterprise app, THEN flip these three and redeploy.
    samlAuthEnabled: false, // FIRST DEPLOY ONLY — flip after Entra app is configured
    // samlCognitoDomainName: 'mimir-dev-auth',            // domain-prefix, see runbook step "the three values"
    // samlCognitoFederatedIdentityProviderName: 'EntraID',
    selfSignUpEnabled: false, // #defaults — no self-signup, Entra-only
    allowedSignUpEmailDomains: ['revfin.in'], // belt-and-suspenders even with self-signup off + SAML-only later

    // Telemetry — no explicit decision in decisions.md; set off as the
    // conservative default for a fintech's internal tool. Flag this as an
    // inferred call, not a cited decision — worth a one-line confirmation.
    anonymousUsageTracking: false,

    // ---------------------------------------------------------------------
    // WAF / IP restriction — deliberately UNSET (schema default is already
    // null/off). Setting any of these three triggers a whole extra WAF
    // stack in us-east-1 plus its own CDK bootstrap there. Decisions.md:
    // "WAF deferred at launch per the cost posture" — Cognito auth +
    // CloudFront defaults carry a 10-user internal tool.
    // allowedIpV4AddressRanges: null,
    // allowedIpV6AddressRanges: null,
    // allowedCountryCodes: null,

    // ---------------------------------------------------------------------
    // Use cases — Transcribe stays visible (default, #16); hide the
    // surfaces outside the launch scope (#15: chat + RAG + MCP + admin +
    // voice). generate/summarize/writer/translate/webContent are left
    // visible — they're zero-extra-infra chat variants and decision #3
    // calls the stock UI an "internal playground," useful for eval during
    // Phase 1-2. This is a judgment call, not a cited decision — flag it.
    hiddenUseCases: {
      image: true, // out of scope (#15) — also disabled via empty imageGenerationModelIds above
      video: true, // out of scope (#15) — also disabled via empty videoGenerationModelIds above
      videoAnalyzer: true, // out of scope (#15)
      diagram: true, // out of scope (#15)
      meetingMinutes: true, // out of scope (#15)
      voiceChat: true, // #16 — Transcribe only at launch, not full Voice Chat
      // transcribe intentionally omitted/false — stays visible (#16)
    },

    // ---------------------------------------------------------------------
    // Cost-relevant knobs — minimal-cost dev posture (5-10 users, zero idle)
    dashboard: false, // CloudWatch dashboard construct — default false; flip on only when actively investigating usage/cost
    guardrailEnabled: false, // default false; decisions/pivot-plan.md Phase 7 turns this on before hardening/launch, not needed for this bootstrap deploy
    // hostName / domainName / hostedZoneId: left unset. Custom domain +
    // ACM cert is real setup for an "ephemeral, deploy/destroy" dev env
    // (decisions.md cost posture). Use the CloudFront default domain for
    // dev; wire mimir.revfin.in (#18) at prod / when dev domain is wanted.
    tagValue: 'mimir-dev', // optional but free — enables cost-allocation-tag tracking per decisions.md's cost discipline
  },
  staging: {
    // Parameters for staging environment
  },
  prod: {
    // Parameters for production environment
  },
  // If you need other environments, customize them as needed
};

// For backward compatibility, get parameters from CDK Context > parameter.ts
export const getParams = (app: cdk.App): ProcessedStackInput => {
  // By default, get parameters from CDK Context
  let params = getContext(app);

  // If the env matches the ones defined in envs, use the parameters in envs instead of the ones in context
  if (envs[params.env]) {
    params = stackInputSchema.parse({
      ...envs[params.env],
      env: params.env,
    });
  }
  // Make the format of modelIds, imageGenerationModelIds consistent
  const convertToModelConfiguration = (
    models: (string | ModelConfiguration)[],
    defaultRegion: string
  ): ModelConfiguration[] => {
    return models.map((model) =>
      typeof model === 'string'
        ? { modelId: model, region: defaultRegion }
        : model
    );
  };

  return {
    ...params,
    modelIds: convertToModelConfiguration(params.modelIds, params.modelRegion),
    imageGenerationModelIds: convertToModelConfiguration(
      params.imageGenerationModelIds,
      params.modelRegion
    ),
    videoGenerationModelIds: convertToModelConfiguration(
      params.videoGenerationModelIds,
      params.modelRegion
    ),
    speechToSpeechModelIds: convertToModelConfiguration(
      params.speechToSpeechModelIds,
      params.modelRegion
    ),
    endpointNames: convertToModelConfiguration(
      params.endpointNames,
      params.modelRegion
    ),
    // Process agentCoreRegion: null -> modelRegion
    agentCoreRegion: params.agentCoreRegion || params.modelRegion,
    // Compute isAgentCoreNetworkPrivate from VPC configuration
    isAgentCoreNetworkPrivate: !!(
      params.agentCoreVpcId &&
      params.agentCoreSubnetIds &&
      params.agentCoreSubnetIds.length > 0
    ),
    // Load branding configuration
    brandingConfig: loadBrandingConfig(),
  };
};
