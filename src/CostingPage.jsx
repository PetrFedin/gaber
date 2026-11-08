import React from 'react';
import {fabrics, money, getFamily, csv} from './domain.js';
function download(name, data, type) {
  const u = URL.createObjectURL(new Blob([data], {type})),
    a = document.createElement('a');
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
// Внутренняя страница: calc, profile и definitions приходят с сервера только для менеджера и технолога.
export default function CostingPage({
  config,
  profile,
  calc: e,
  definitions,
  onChange,
  onSave,
  dirty,
  canEdit
}) {
  if (!profile || !e)
    return (
      <main className="page costing-page">
        <p className="page-disclaimer">Загружаем нормы и расчёт с сервера…</p>
      </main>
    );
  const change = (key, value, source = false) =>
    onChange({
      ...profile,
      updatedAt: new Date().toISOString(),
      [source ? 'sources' : 'rates']: {...profile[source ? 'sources' : 'rates'], [key]: value}
    });
  return (
    <main className="page costing-page">
      <div className="page-top">
        <div>
          <span className="eyebrow">ПРОЗРАЧНАЯ ЭКОНОМИКА / DEMO</span>
          <h1>Из чего складывается цена</h1>
          <p>Редактируемые нормы, источники ставок и полный путь расчёта.</p>
        </div>
        <a className="button dark" href="#studio">
          Вернуться к предмету ↗
        </a>
      </div>
      <div className="costing-summary">
        <article>
          <small>
            {getFamily(config).name} · {config.width} см
          </small>
          <strong>{money(e.cost)}</strong>
          <span>Себестоимость</span>
        </article>
        <article>
          <small>Маржа {profile.rates.targetMargin}% до скидки</small>
          <strong>{money(e.price)}</strong>
          <span>Предварительная цена</span>
        </article>
        <article>
          <small>Без доставки, монтажа и налогов</small>
          <strong>{money(e.profit)}</strong>
          <span>Валовая прибыль · демо</span>
        </article>
      </div>
      <div className="formula-grid">
        {[
          ['01', 'Количество', 'Геометрия + выбранные опции → нормы ткани, каркаса, наполнения и времени.'],
          ['02', 'Прямые затраты', 'Количество × ставка по каждой статье. Ткань учитывает процент отходов.'],
          ['03', 'Себестоимость', 'Сумма прямых затрат + накладные от этой суммы.'],
          ['04', 'Цена', 'Себестоимость ÷ (1 − маржа / 100), округление вверх до 100 ₽.']
        ].map(([n, h, p]) => (
          <article key={n}>
            <span className="eyebrow">{n}</span>
            <h3>{h}</h3>
            <p>{p}</p>
          </article>
        ))}
      </div>
      <details className="formula-details">
        <summary>Показать количественные формулы текущего предмета</summary>
        <p>
          Площадь нормы: изголовье = ширина × высота; кровать = ширина × глубина; сиденье = ширина × глубина +
          площадь шезлонга. Метры используются после перевода сантиметров.
        </p>
        <p>
          Ткань до отходов: изголовье = площадь × 1,6; кровать = площадь × 0,85 + ширина × высота; сиденье =
          площадь × 2,4 × коэффициент спинки + 2,8. Дополнительно: площадь каждой подушки × 3, 1,2 м на
          шезлонг, 1 м на съёмные чехлы.
        </p>
        <p>
          Каркас: площадь × коэффициент формы (органическая 1,18; геометричная 0,96; округлая 1). Коэффициент
          спинки для сиденья = 1 + (толщина спинки − 23) / 200; для кровати и изголовья — 1. Наполнение:
          площадь × коэффициент спинки × 0,5 для изголовья или × 1 для остального × коэффициент мягкости
          (мягкое 1,22; упругое 1,08; баланс 1) + 0,12 на подушку.
        </p>
        <p>
          Часы: изголовье (6 + площадь × 1,8), кровать (12 + площадь × 2), сиденье (9 + ширина × 3), всё ×
          коэффициент формы. Дополнительно: 0,5 ч на подушку; механизм +3 ч; хранение +2; съёмный чехол +2;
          USB +1; лампы +1,5.
        </p>
        <p>
          Кант / двойная строчка: 2 × (ширина + глубина) + количество подушек × (ширина + высота подушки) /
          50. Двойная строчка: ставка × 1,25. Остальные опции — один комплект; модульные соединения — число
          модулей минус один.
        </p>
        <p>
          Текущие нормы: площадь {e.area} м²; ткань без отходов {e.netFabric} м → {e.fabricMeters} м с
          отходами; труд {e.hours} ч. Это упрощённые формулы прототипа, без раскладки лекал и расчёта
          прочности.
        </p>
      </details>
      <section className="rates-section">
        <div className="section-top">
          <div>
            <h2>Нормы фабрики</h2>
            <p>
              {canEdit
                ? 'Правки видны в расчёте сразу, но действуют для заказов только после сохранения на сервере. Сохранённые версии проектов сохраняют прежний снимок расчёта.'
                : 'Нормы может менять только технолог. Вы видите действующие ставки сервера.'}
            </p>
          </div>
          {canEdit && (
            <button className="button dark" disabled={!dirty} onClick={onSave}>
              {dirty ? 'Сохранить нормы' : 'Сохранено'}
            </button>
          )}
        </div>
        <label className="advanced-field">
          <span>Название профиля</span>
          <input
            value={profile.name}
            disabled={!canEdit}
            maxLength={100}
            onChange={(ev) => onChange({...profile, name: ev.target.value})}
          />
        </label>
        <div className="table-scroll">
          <table className="rates-table">
            <thead>
              <tr>
                <th>Статья</th>
                <th>Ставка</th>
                <th>Ед.</th>
                <th>Источник / документ / дата</th>
              </tr>
            </thead>
            <tbody>
              {definitions.map(([key, name, unit]) => (
                <tr key={key}>
                  <td>{name}</td>
                  <td>
                    <input
                      aria-label={name}
                      disabled={!canEdit}
                      type="number"
                      min="0"
                      max={key === 'targetMargin' ? 89 : ['waste', 'overhead'].includes(key) ? 99 : 999999}
                      value={profile.rates[key]}
                      onChange={(ev) => {
                        const n = +ev.target.value;
                        if (
                          Number.isFinite(n) &&
                          n >= 0 &&
                          n <
                            (key === 'targetMargin'
                              ? 90
                              : ['waste', 'overhead'].includes(key)
                                ? 100
                                : 1000000)
                        )
                          change(key, n);
                      }}
                    />
                  </td>
                  <td>{unit}</td>
                  <td>
                    <input
                      aria-label={`Источник: ${name}`}
                      disabled={!canEdit}
                      maxLength={200}
                      value={profile.sources[key] || ''}
                      onChange={(ev) => change(key, ev.target.value, true)}
                    />
                  </td>
                </tr>
              ))}
              {fabrics.map((f) => (
                <tr key={f.id}>
                  <td>Ткань · {f.collection}</td>
                  <td>
                    <input
                      aria-label={`Цена ткани ${f.collection}`}
                      disabled={!canEdit}
                      type="number"
                      min="0"
                      max="999999"
                      value={profile.fabricPrices[f.id] ?? ''}
                      placeholder="базовая"
                      onChange={(ev) => {
                        const n = +ev.target.value;
                        if (n >= 0 && n < 1000000)
                          onChange({...profile, fabricPrices: {...profile.fabricPrices, [f.id]: n}});
                      }}
                    />
                  </td>
                  <td>₽/пог. м</td>
                  <td>
                    <input
                      aria-label={`Источник ткани ${f.collection}`}
                      disabled={!canEdit}
                      maxLength={200}
                      value={profile.fabricSources[f.id] || ''}
                      placeholder="Прайс поставщика и дата · пока демо"
                      onChange={(ev) =>
                        onChange({
                          ...profile,
                          fabricSources: {...profile.fabricSources, [f.id]: ev.target.value}
                        })
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <div className="section-top">
          <h2>Расчёт текущего предмета</h2>
          <button
            className="button outline"
            onClick={() =>
              download(
                'gaber-costing.csv',
                csv([
                  ['Статья', 'Количество', 'Ед.', 'Ставка', 'Сумма', 'Источник'],
                  ...e.rows.map((x) => [x.name, x.qty, x.unit, x.rate, x.cost, x.source]),
                  ['Себестоимость', '', '', '', e.cost],
                  ['Цена', '', '', '', e.price]
                ]),
                'text/csv;charset=utf-8'
              )
            }
          >
            Скачать CSV ↓
          </button>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Статья</th>
                <th>Количество × ставка</th>
                <th>Сумма</th>
                <th>Источник</th>
              </tr>
            </thead>
            <tbody>
              {e.rows.map((x) => (
                <tr key={x.id}>
                  <td>{x.name}</td>
                  <td>
                    {x.qty} {x.unit} × {money(x.rate)}
                  </td>
                  <td>{money(x.cost)}</td>
                  <td>{x.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="page-disclaimer">
        Нормы демонстрационные. Это калькулятор по заданным правилам, а не подтверждённая производственная
        смета. Учёт НДС, брака, скидок поставщиков, логистики и планирования мощности требует данных и учётной
        политики фабрики.
      </p>
    </main>
  );
}
