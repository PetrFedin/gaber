import test from 'node:test';
import assert from 'node:assert/strict';
import {CLIENT_OFFER_ASSURANCE_SCHEMA,getClientOfferAssurance,getCurrentClientOffer} from '../src/clientOffer.js';

const base = () => ({
  stage: 'requested',
  revisions: [],
  specs: []
});

test('client assurance is pending before a factory decision', () => {
  const result = getClientOfferAssurance(base());
  assert.equal(result.schemaVersion, CLIENT_OFFER_ASSURANCE_SCHEMA);
  assert.equal(result.status, 'confirmation_pending');
  assert.equal(result.reference, null);
  assert.equal(result.confirmedAt, null);
  assert.equal(result.realFactoryConfirmed, false);
  assert.equal(result.capacityConfirmed, false);
  assert.equal(result.calendarDateConfirmed, false);
  assert.equal(result.productionReleaseAllowed, false);
});

test('confirmation is bound to the exact offered revision and exposes no economics or factory note', () => {
  const state = base();
  state.stage = 'offered';
  state.specs.push(
    {id:'S1',status:'published_to_client',factoryDecision:{status:'confirmed_concept_only',reference:'OLD-ACK',at:'2026-10-01T10:00:00.000Z',note:'Internal old note'},economics:{factoryCostKopecks:1}},
    {id:'S2',status:'published_to_client',factoryDecision:{status:'confirmed_concept_only',reference:'ACK-42',at:'2026-10-30T10:00:00.000Z',note:'Sensitive internal factory note'},economics:{factoryCostKopecks:2}}
  );
  state.revisions.push({id:'R1',specId:'S1'},{id:'R2',specId:'S2'});
  const result = getClientOfferAssurance(state);
  assert.equal(result.status, 'local_concept_confirmed');
  assert.equal(result.revisionId, 'R2');
  assert.equal(result.specId, 'S2');
  assert.equal(result.reference, 'ACK-42');
  assert.equal(result.confirmedAt, '2026-10-30T10:00:00.000Z');
  assert.equal(Object.hasOwn(result, 'note'), false);
  assert.equal(Object.hasOwn(result, 'economics'), false);
});

test('requested changes and incomplete acknowledgements fail closed to pending', () => {
  for (const factoryDecision of [
    {status:'changes_requested',reference:null,at:'2026-10-30T10:00:00.000Z'},
    {status:'confirmed_concept_only',reference:'',at:'2026-10-30T10:00:00.000Z'},
    {status:'confirmed_concept_only',reference:'ACK',at:''}
  ]) {
    const state = base();
    state.stage = 'offered';
    state.specs.push({id:'S1',status:'published_to_client',factoryDecision});
    state.revisions.push({id:'R1',specId:'S1'});
    const result = getClientOfferAssurance(state);
    assert.equal(result.status, 'confirmation_pending');
    assert.equal(result.reference, null);
    assert.equal(result.confirmedAt, null);
  }
});

test('invalid state and a revision without its source specification are rejected', () => {
  assert.throws(() => getClientOfferAssurance(null), /OFFER_ASSURANCE_INVALID/);
  assert.throws(() => getClientOfferAssurance({}), /OFFER_ASSURANCE_INVALID/);
  const state = base();
  state.revisions.push({id:'R1',specId:'MISSING'});
  assert.throws(() => getClientOfferAssurance(state), /OFFER_ASSURANCE_INVALID/);
});

test('change request immediately revokes old confirmation and commercial quote', () => {
 const state = base();
 state.stage = 'offered';
 state.specs.push({id:'S1',status:'published_to_client',
   factoryDecision:{status:'confirmed_concept_only',reference:'ACK-R1',at:'2026-10-30T10:00:00Z'}});
 state.revisions.push({id:'R1',specId:'S1',priceKopecks:123456});
 assert.equal(getCurrentClientOffer(state)?.id,'R1');
 for(const stage of ['change_requested','awaiting_factory','factory_changes','factory_confirmed']) {
  const pending={...state,stage};
  assert.equal(getCurrentClientOffer(pending),null,stage);
  const assurance=getClientOfferAssurance(pending);
  assert.equal(assurance.status,'confirmation_pending',stage);
  assert.equal(assurance.revisionId,null,stage);
  assert.equal(assurance.reference,null,stage);
 }
});
test('unpublished replacement spec and orphan/forged confirmation cannot renew R1', () => {
 const state=base();state.stage='offered';
 state.revisions.push({id:'R1',specId:'S1'});
 state.specs.push({id:'S1',status:'published_to_client',
  factoryDecision:{status:'confirmed_concept_only',reference:'ACK-1',at:'2026-10-30T10:00:00Z'}});
 assert.equal(getCurrentClientOffer(state).id,'R1');
 state.specs.push({id:'S2',status:'awaiting_factory',factoryDecision:null});
 assert.equal(getCurrentClientOffer(state),null);
 assert.equal(getClientOfferAssurance(state).status,'confirmation_pending');
 state.revisions.push({id:'R2',specId:'S2'});
 state.specs[1].factoryDecision={status:'confirmed_concept_only',reference:'ACK-2',at:'2026-10-30T12:00:00Z'};
 state.specs[1].status='factory_confirmed';
 assert.equal(getCurrentClientOffer(state),null);
 state.specs[1].status='published_to_client';
 assert.equal(getCurrentClientOffer(state)?.id,'R2');
});
