import React from 'react';
import {getClientOfferAssurance} from './clientOffer.js';

export default function ClientOfferAssurance({state}) {
  const assurance = getClientOfferAssurance(state);
  const confirmed = assurance.status === 'local_concept_confirmed';
  return <section className="order-technical-task client-offer-assurance" aria-label="Статус подтверждения предложения">
    <h4>Проверка перед согласованием</h4>
    <p><strong>{confirmed
      ? 'Концепт-ТЗ подтверждено в локальном сценарии'
      : 'Локальное подтверждение концепт-ТЗ ещё не получено'}</strong></p>
    <dl className="order-ledger">
      {assurance.revisionId&&<div><dt>Ревизия предложения</dt><dd>{assurance.revisionId}</dd></div>}
      {assurance.specId&&<div><dt>Связанное ТЗ</dt><dd>{assurance.specId}</dd></div>}
      {assurance.reference&&<div><dt>Документ подтверждения</dt><dd>{assurance.reference}</dd></div>}
      {assurance.confirmedAt&&<div><dt>Дата локальной записи</dt><dd>{assurance.confirmedAt.slice(0,10)}</dd></div>}
    </dl>
    <p className="helper">Подтверждается только концепт-ТЗ в этом браузере. Запись не подтверждает реальную фабрику, мощности, календарную дату, банковские операции или производственный допуск.</p>
  </section>;
}
