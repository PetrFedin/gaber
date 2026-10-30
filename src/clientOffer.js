export const CLIENT_OFFER_ASSURANCE_SCHEMA = 'gaber-client-offer-assurance/1';

const fail = code => { throw Error(code); };

/**
 * Client-safe projection of the local concept-TZ acknowledgement.
 * It deliberately excludes factory notes and all commercial economics.
 */
export function getClientOfferAssurance(state) {
  if (!state || typeof state !== 'object' ||
      !Array.isArray(state.revisions) || !Array.isArray(state.specs)) {
    fail('OFFER_ASSURANCE_INVALID');
  }

  const revision = state.revisions.at(-1) ?? null;
  const spec = revision
    ? state.specs.find(item => item?.id === revision.specId)
    : state.specs.at(-1) ?? null;
  if ((revision && !spec) || (spec && typeof spec !== 'object')) {
    fail('OFFER_ASSURANCE_INVALID');
  }

  const decision = spec?.factoryDecision;
  const confirmed = decision?.status === 'confirmed_concept_only' &&
    typeof decision.reference === 'string' && decision.reference.length > 0 &&
    typeof decision.at === 'string' && decision.at.length > 0;

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
