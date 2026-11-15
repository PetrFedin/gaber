import React from 'react';
import {getAvailableParts, getDesignAdvisories, getPartDescriptor, PART_LABELS} from './designGuidance.js';
import './designExperience.css';

export function DesignAdvisories({config}) {
  const advisories = getDesignAdvisories(config);
  return <section className="design-advisories" aria-label="Рекомендации по конфигурации">
    <h3>Проверка замысла</h3>
    {advisories.length === 0
      ? <p className="design-advisory-clear">Явных пропорциональных рисков по правилам эскиза не найдено. Конструкцию и удобство всё равно проверяет фабрика.</p>
      : <div className="design-advisory-list">{advisories.map(item => <article key={item.id} className={`design-advisory ${item.severity}`}>
        <strong>{item.title}</strong>
        <p>{item.explanation}</p>
        <p><b>Что сделать:</b> {item.recommendation}</p>
      </article>)}</div>}
    <p className="design-advisory-note">Рекомендации — правила цифрового эскиза, не прочностной расчёт. Запрещённые сочетания по-прежнему блокируются отдельно.</p>
  </section>;
}

export default function DesignExperience({
  config,
  inspection,
  explosion,
  autoRotate,
  reducedMotion,
  selectedPart,
  onAutoRotateChange,
  onInspectionChange,
  onExplosionChange,
  onSelectPart
}) {
  const parts = getAvailableParts(config, inspection);
  const descriptor = getPartDescriptor(config, selectedPart);
  return <div className="design-experience">
    <div className="design-experience-bar" aria-label="Управление обзором и сборкой">
      <div className="design-view-actions">
        <button type="button" className={autoRotate ? 'active' : ''} aria-pressed={autoRotate}
          disabled={reducedMotion} title={reducedMotion ? 'Автовращение отключено настройкой reduced motion; вращайте модель вручную' : 'Непрерывный обзор на 360 градусов'}
          onClick={() => onAutoRotateChange(!autoRotate)}>{autoRotate ? 'Остановить 360°' : 'Обзор 360°'}</button>
        <button type="button" className={inspection && explosion === 0 ? 'active' : ''}
          onClick={() => {onInspectionChange(true); onExplosionChange(0);}}>Собрать</button>
        <button type="button" className={inspection && explosion > 0 ? 'active' : ''}
          onClick={() => {onInspectionChange(true); onExplosionChange(1);}}>Разобрать</button>
        {inspection && <button type="button" onClick={() => {onInspectionChange(false); onExplosionChange(0);}}>Обивка</button>}
      </div>
      <label className="design-part-select">
        <span className="sr-only">Выбрать элемент изделия</span>
        <select aria-label="Описание элемента" value={selectedPart || ''} onChange={event => onSelectPart(event.target.value || null)}>
          <option value="">Описание детали…</option>
          {parts.map(id => <option key={id} value={id}>{PART_LABELS[id]}</option>)}
        </select>
      </label>
    </div>
    {inspection && <label className="design-explosion-control">
      <span>Разнесение элементов</span>
      <input aria-label="Разнесение элементов" type="range" min="0" max="100" step="1"
        value={Math.round(explosion * 100)} onChange={event => onExplosionChange(Number(event.target.value) / 100)}/>
      <output>{Math.round(explosion * 100)}%</output>
    </label>}
    {descriptor && <section className="design-part-card" aria-live="polite" aria-label={`Описание: ${descriptor.title}`}>
      <div className="design-part-heading">
        <div><span>{descriptor.status}</span><h3>{descriptor.title}</h3></div>
        <button type="button" aria-label="Закрыть описание детали" onClick={() => onSelectPart(null)}>×</button>
      </div>
      <p>{descriptor.description}</p>
      <dl>{descriptor.facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <p className="design-part-note">{descriptor.assemblyNote}</p>
    </section>}
  </div>;
}
