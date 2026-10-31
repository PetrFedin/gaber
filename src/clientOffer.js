export const CLIENT_OFFER_ASSURANCE_SCHEMA = 'gaber-client-offer-assurance/2';

const fail = code => { throw Error(code); };
const PUBLISHED_STAGES = new Set([
  'offered', 'accepted', 'production', 'quality', 'ready', 'shipped',
  'delivered', 'disputed', 'closed'
]);

/**
 * The last revision is CURRENT only while it points to the newest factory-
 * acknowledged, partner-published specification. As soon as the client
 * requests changes or the partner submits a new S-revision, old R-prices
 * remain in the immutable history but MUST NOT be presented as payable.
 *
 * This is a state-derived display gate, never a payment authorization.
 */
export function getCurrentClientOffer(state) {
  if (!state || typeof state !== 'object' ||
      !Array.isArray(state.revisions) || !Array.isArray(state.specs)) {
    fail('OFFER_ASSURANCE_INVALID');
  }
  if (!PUBLISHED_STAGES.has(state.stage)) return null;
  const revision = state.revisions.at(-1);
  const latestSpec = state.specs.at(-1);
  if (!revision || !latestSpec ||
      typeof revision.id !== 'string' ||
      typeof latestSpec.id !== 'string' ||
      revision.specId !== latestSpec.id ||
      latestSpec.status !== 'published_to_client' ||
      latestSpec.factoryDecision?.status !== 'confirmed_concept_only' ||
      typeof latestSpec.factoryDecision.reference !== 'string' ||
      !latestSpec.factoryDecision.reference.trim() ||
      typeof latestSpec.factoryDecision.at !== 'string' ||
      !Number.isFinite(Date.parse(latestSpec.factoryDecision.at))) return null;
  return revision;
}

/** Client-safe, active-revision-only acknowledgement projection. */
export function getClientOfferAssurance(state) {
  if (!state || typeof state !== 'object' ||
      !Array.isArray(state.revisions) || !Array.isArray(state.specs)) {
    fail('OFFER_ASSURANCE_INVALID');
  }
  const historicalRevision = state.revisions.at(-1) ?? null;
  if (historicalRevision && !state.specs.some(s => s?.id === historicalRevision.specId)) {
    fail('OFFER_ASSURANCE_INVALID');
  }
  const revision = getCurrentClientOffer(state);
  const spec = revision ? state.specs.at(-1) : null;
  const decision = spec?.factoryDecision;
  const confirmed = !!revision;
  return Object.freeze({
    schemaVersion: CLIENT_OFFER_ASSURANCE_SCHEMA,
    revisionId: revision?.id ?? null,
    specId: spec?.id ?? null,
    status: confirmed ? 'local_concept_confirmed' : 'confirmation_pending',
    scope: 'concept_technical_task_only',
    reference: confirmed ? decision.reference : null,
    confirmedAt: confirmed ? decision.at : null,
    authority: 'LOCAL_WORKFLOW_SIMULATION',
    realFactoryConfirmed: false,
    capacityConfirmed: false,
    calendarDateConfirmed: false,
    productionReleaseAllowed: false
  });
}
