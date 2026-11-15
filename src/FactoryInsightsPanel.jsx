import React,{useMemo} from 'react';
import {buildFactoryInsights} from './factoryInsights.js';
import {money} from './domain.js';

/** Provisional human-entered inputs; never reports actual or approved costs. */
export default function FactoryInsightsPanel({config,draft}){
 const a=useMemo(()=>buildFactoryInsights(config,draft),[config,draft]);
 const valid=a.status!=='invalid-input';
 const percent=n=>Number.isFinite(n)?n.toLocaleString('ru-RU',{maximumFractionDigits:1})+'%':'—';
 return <section className="gaber-insights" aria-label="Аналитика производственного черновика">
  <div className="gaber-insights-heading">
   <div><span className="eyebrow">ФИНАНСОВАЯ ПРОСЛЕЖИВАЕМОСТЬ</span>
    <h3>Аналитика введённых нормативов</h3>
    <p>Показываем только затраты из введённых строк, раздельно от утверждённой и фактической себестоимости.</p>
   </div>
   <span className="gaber-insights-status">{valid?a.coverage.fullyEntered?'Все строки введены':'Ввод не завершён':'Есть ошибки ввода'}</span>
  </div>
  <div className="gaber-insights-metrics">
   <article><span>Материалы · предварительно</span>
    <strong>{money(a.totals.enteredMaterialsRUB)}</strong>
    <small>Без проверки поставщика и измерений</small></article>
   <article><span>Работы · предварительно</span>
    <strong>{money(a.totals.enteredOperationsRUB)}</strong>
    <small>Нормо-время и ставки из черновика</small></article>
   <article><span>Прямые затраты · по введённым строкам</span>
    <strong>{money(a.totals.enteredDirectRUB)}</strong>
    <small>{a.totals.provisionalDirectRUB===null?'Полный предварительный итог недоступен':'Введены обязательные строки; не согласовано'}</small></article>
  </div>
  <div className="gaber-insights-coverage">
   <div><strong>Покрытие расчётных позиций</strong><span>{percent(a.coverage.enteredPct)}</span></div>
   <div className="gaber-progress" aria-label={'Заполнено '+percent(a.coverage.enteredPct)}>
    <span style={{width:Math.max(0,Math.min(100,a.coverage.enteredPct))+'%'}}/></div>
   <div className="gaber-insights-coverage-detail">
    <span>Материалы: {a.coverage.enteredMaterials} из {a.coverage.requiredMaterials}</span>
    <span>Операции: {a.coverage.enteredOperations} из {a.coverage.requiredOperations}</span>
    <span>Единицы требуют проверки: {a.coverage.unitReviewRefs.length}</span>
   </div>
   <p>100% означает только заполненные поля. Ни одна запись не является подтверждением поставщика, закупки или допуска к изготовлению.</p>
  </div>
  <div className="gaber-insights-columns">
   <div><h4>Структура затрат по материалам</h4>
    {a.byGroup.filter(g=>g.requiredItems||g.enteredLines).map(group=>
     <div className="gaber-insights-group" key={group.id}>
      <div><span>{group.label}</span><strong>{money(group.enteredRUB)}</strong></div>
      <div className="gaber-progress"><span style={{width:Math.max(0,Math.min(100,group.sharePct))+'%'}}/></div>
      <small>Учтено {group.enteredLines} · не оценено {group.missingItems} · доля в введённых прямых затратах {percent(group.sharePct)}</small>
     </div>)}
    {!a.byGroup.length&&<p className="gaber-muted">Данные для структуры затрат пока не введены.</p>}
   </div>
   <div><h4>Загрузка участков по нормо-времени</h4>
    {!a.byWorkCenter.length?<p className="gaber-muted">После ввода операций появятся затраты и минуты по участкам.</p>:
     <div className="gaber-insights-table"><table>
      <thead><tr><th>Участок</th><th>Минуты</th><th>Затраты</th></tr></thead>
      <tbody>{a.byWorkCenter.map(item=><tr key={item.id}>
       <td>{item.id}<small>{item.operations} операций</small></td>
       <td>{item.minutes.toLocaleString('ru-RU')}</td><td>{money(item.enteredRUB)}</td>
      </tr>)}</tbody></table></div>}
    <h4 className="gaber-insights-subheading">Наиболее затратные введённые строки</h4>
    {!a.topLines.length?<p className="gaber-muted">Нет строк с введёнными затратами.</p>:
     <div className="gaber-insights-table"><table>
      <thead><tr><th>Деталь / операция</th><th>Сумма</th></tr></thead>
      <tbody>{a.topLines.map(row=><tr key={row.type+row.id}>
       <td><span title={row.label}>{row.label}</span><small>{row.type==='operation'?'Работа':'Материал'} · {percent(row.sharePct)}</small></td>
       <td>{money(row.amountRUB)}</td>
      </tr>)}</tbody></table></div>}
   </div>
  </div>
  {a.issues.length>0&&<div className="gaber-insights-alert" role="alert">
   <strong>Ошибки исходных данных</strong>
   <p>{a.issues.slice(0,5).map(issue=>issue.code).join(' · ')}. Исправьте их до использования сравнений стоимости.</p>
  </div>}
  <p className="gaber-insights-disclosure">Финансовые показатели предварительные. Налоги, логистика,
   подтверждённые нормы раскроя, закупочная цена, фактический расход и валовая маржа
   производства не определены. Производственный допуск закрыт.</p>
 </section>;
}
