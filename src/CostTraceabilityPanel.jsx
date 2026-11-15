import React,{useMemo,useState} from 'react';
import {money} from './domain.js';
import {createCostTraceability,compareCostTraceability} from './costTraceability.js';

/**
 * Cost links are only traceable demonstrative categories: not cost per bolt
 * or foam piece, not an authorized factory quote.
 */
export default function CostTraceabilityPanel({config,profile}){
  const [baseline,setBaseline]=useState(null);
  const trace=useMemo(()=>createCostTraceability(config,profile),[config,profile]);
  const delta=useMemo(()=>baseline?compareCostTraceability(baseline.config,config,baseline.profile,profile):null,[baseline,config,profile]);
  return <section className="rates-section" aria-label="Трассировка затрат к производственным элементам">
    <div className="section-top"><div>
      <h2>Связь калькуляции с деталями · v0.4.6</h2>
      <p>Каждая статья демонстрационной себестоимости привязана к инженерным элементам или явно отмеченной отсутствующей спецификации. Сумма статей сверяется с калькулятором.</p>
    </div></div>
    <div className="costing-summary">
      <article><small>Статей с инженерными ссылками</small><strong>{trace.rows.length}</strong><span>{trace.audit.ok?'Баланс расчёта совпадает':'Найдены расхождения'}</span></article>
      <article><small>Цифровых элементов и операций</small><strong>{trace.coverage.entityCount}</strong><span>Из них со ссылками: {trace.coverage.mappedEntityCount}</span></article>
      <article><small>Статей с неполными нормативами</small><strong>{trace.coverage.rowsWithUnmodelledBasis.length}</strong><span>Не является производственной сметой</span></article>
    </div>
    <p className="page-disclaimer">Внимание: связи не распределяют цену между деталями. Индивидуальная цена материала, технологические минуты, полноценный раскрой, партия и нормы отходов не подтверждены. Производственный выпуск заблокирован.</p>
    <details><summary>Раскрыть связи «Статья → детали / материалы / операции»</summary>
      <div className="table-scroll"><table><thead><tr><th>Статья</th><th>Демо-сумма</th><th>Связано объектов</th><th>Источник / полнота</th></tr></thead>
      <tbody>{trace.rows.map(r=><tr key={r.id}><td>{r.description}</td><td>{money(r.demoAmountRUB)}</td>
        <td><details><summary>{r.linkedEntityIds.length}</summary><small>{r.linkedEntityIds.join(' · ')}</small></details></td>
        <td>{r.hasUnmodelledBasis?'Требует заводских данных':'Есть цифровые связи, ставки демонстрационные'}</td></tr>)}</tbody>
      </table></div>
    </details>
    {trace.coverage.unpricedHardwareRefs.length>0&&<p className="inline-warning">Не охвачены отдельной статьёй калькуляции: {trace.coverage.unpricedHardwareRefs.join(', ')}. Требуется отдельная производственная норма и проверенная ставка.</p>}
    <div className="technical-actions"><button className="button outline" type="button" onClick={()=>setBaseline({config:structuredClone(config),profile:structuredClone(profile)})}>Зафиксировать расчёт для сравнения</button>
      {baseline&&<button className="button outline" type="button" onClick={()=>setBaseline(null)}>Снять сравнение</button>}</div>
    {delta&&<div className="formula-details"><h3>Изменения относительно зафиксированного варианта</h3>
      <p>Себестоимость (демо): {money(delta.beforeCostRUB)} → {money(delta.afterCostRUB)}.
      Разница: {delta.deltaCostRUB>=0?'+':''}{money(delta.deltaCostRUB)}.
      Статей с изменениями: {delta.changedRows.length};
      добавлено элементов: {delta.addedEntityIds.length};
      удалено: {delta.removedEntityIds.length};
      изменена геометрия или структура: {delta.changedEntityIds.length}.</p>
      <details><summary>Статьи с изменением расчёта</summary><div className="table-scroll"><table><thead><tr><th>Статья</th><th>Было</th><th>Стало</th><th>Изменение</th></tr></thead><tbody>
      {delta.changedRows.map(r=><tr key={r.id}><td>{r.id}</td><td>{money(r.priorCostRUB)}</td><td>{money(r.currentCostRUB)}</td><td>{money(r.deltaRUB)}</td></tr>)}
      </tbody></table></div></details>
    </div>}
  </section>;
}
