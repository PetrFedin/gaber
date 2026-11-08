import {optionName} from './ConfigurationDetails.jsx';
import React, {useRef} from 'react';
import {dimensions, getFamily, getFabric, getColor, csv} from './domain.js';
export function assemblyNodes(c) {
  const head = c.category === 'headboard',
    bed = c.category === 'bed',
    seat = !head && !bed;
  return [
    ['A', 'Основа / каркас', 1, `${c.width} × ${c.depth} см · внешний габарит`],
    ...(head || bed
      ? [['B', 'Панели изголовья', c.panels, `${c.height} см · высота изделия`]]
      : [
          [
            'B',
            'Посадочный модуль',
            c.category === 'sofa' ? c.moduleCount : 1,
            'Размеры после технологической разбивки'
          ],
          ['C', 'Спинка', c.category === 'sofa' ? c.moduleCount : 1, `Толщина ${c.backDepth} см`]
        ]),
    ...(seat && c.arm !== 'none'
      ? [['D', 'Подлокотник', 2, c.woodArms ? 'С деревянной вставкой' : 'Мягкая обивка']]
      : []),
    ...(!head && c.legs !== 'none' ? [['E', 'Опорный комплект', 1, optionName(c.legs)]] : []),
    ...(c.pillows
      ? [
          [
            'F',
            'Декоративная подушка',
            c.pillows,
            `${c.pillowWidth} × ${c.pillowHeight} см · ${optionName(c.pillowShape)}`
          ]
        ]
      : []),
    ...(c.storage ? [['G', 'Короб хранения', 1, 'Комплект с подъёмным узлом']] : []),
    ...(c.mechanism !== 'none' ? [['H', 'Механизм трансформации', 1, optionName(c.mechanism)]] : []),
    ...(c.charging ? [['J', 'Модуль зарядки', 1, 'Артикул, питание и кабельный маршрут на проверку']] : []),
    ...(c.lamps ? [['K', 'Освещение', 1, 'Комплект · схема подключения на проверку']] : []),
    [
      'L',
      'Обивка / чехлы',
      1,
      `${getFabric(c).name} · ${getColor(c).name} · ${c.covers === 'removable' ? 'съёмные' : 'несъёмные'}`
    ]
  ];
}
function save(name, text, type) {
  const u = URL.createObjectURL(new Blob([text], {type})),
    a = document.createElement('a');
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
export default function TechnicalPage({config: c}) {
  const ref = useRef(),
    d = dimensions(c),
    nodes = assemblyNodes(c),
    scale = Math.min(390 / d.width, 220 / d.depth, 180 / d.height),
    w = d.width * scale,
    z = d.depth * scale,
    h = d.height * scale,
    head = c.category === 'headboard',
    bed = c.category === 'bed';
  return (
    <main className="page technical-page">
      <div className="page-top">
        <div>
          <span className="eyebrow">ПАСПОРТ КОНФИГУРАЦИИ / 02</span>
          <h1>Предмет по частям</h1>
          <p>{getFamily(c).collection} · габариты, узлы и маршрут сборки.</p>
        </div>
        <a className="button dark" href="#studio">
          В конструктор ↗
        </a>
      </div>
      <div className="technical-banner">
        Концептуальная схема. Не рабочий чертёж для изготовления. Все размеры в сантиметрах.
      </div>
      <div className="drawing-sheet">
        <svg
          ref={ref}
          viewBox="0 0 1000 600"
          role="img"
          aria-label={`Схема изделия ${d.width} на ${d.depth} на ${d.height} сантиметров`}
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect width="1000" height="600" fill="#faf9f5" />
          <g fill="none" stroke="#526451" strokeWidth="1.5">
            <rect x="65" y="85" width={w} height={c.layout !== 'straight' ? c.depth * scale : z} />
            {!head && <rect x="65" y="85" width={w} height={bed ? Math.min(20, z) : c.backDepth * scale} />}
            <rect x="65" y="385" width={w} height={h} />
            <rect x="600" y="385" width={z} height={h} />
            {Array.from(
              {length: head || bed ? c.panels : c.category === 'sofa' ? c.moduleCount : 1},
              (_, i) => (
                <line
                  key={i}
                  x1={65 + (w * i) / (head || bed ? c.panels : c.category === 'sofa' ? c.moduleCount : 1)}
                  x2={65 + (w * i) / (head || bed ? c.panels : c.category === 'sofa' ? c.moduleCount : 1)}
                  y1="385"
                  y2={385 + h}
                />
              )
            )}
            {c.layout !== 'straight' && (
              <rect
                x={c.layout === 'left' ? 65 : 65 + w - w / c.moduleCount}
                y={85 + c.depth * scale}
                width={w / c.moduleCount}
                height={65 * scale}
              />
            )}
            <path
              d={`M65 65h${w}m-${w} -5v10m${w} -10v10M45 85v${z}m-5 -${z}h10m-10 ${z}h10M580 385v${h}m-5 -${h}h10m-10 ${h}h10`}
              stroke="#a8aea1"
            />
          </g>
          <g fill="#354535" fontFamily="sans-serif" fontSize="13">
            <text x="65" y="40">
              01 / ВИД СВЕРХУ
            </text>
            <text x={65 + w / 2} y="57" textAnchor="middle">
              {d.width} см
            </text>
            <text x="15" y={90 + z / 2}>
              {d.depth}
            </text>
            <text x="65" y="360">
              02 / ВИД СПЕРЕДИ · ГАБАРИТНАЯ ОБОЛОЧКА
            </text>
            <text x="600" y="360">
              03 / ВИД СБОКУ
            </text>
            <text x="535" y={390 + h / 2}>
              {d.height}
            </text>
            <text x="600" y="85">
              GABER / {getFamily(c).collection.toUpperCase()}
            </text>
            <text x="600" y="115">
              Ш × Г × В: {d.width} × {d.depth} × {d.height} см
            </text>
            <text x="600" y="145">
              Масштаб условный · один коэффициент для трёх видов
            </text>
            <text x="600" y="175">
              Точки крепления и допуски не заданы
            </text>
            <text x="600" y="205">
              Окончательные лекала и узлы выдаёт технолог
            </text>
            <text x="65" y="575">
              ЦИФРОВОЙ ЭСКИЗ · DEMO · НЕ ДЛЯ ИЗГОТОВЛЕНИЯ
            </text>
          </g>
        </svg>
      </div>
      <div className="technical-actions">
        <button
          className="button outline"
          onClick={() =>
            save('gaber-drawing.svg', new XMLSerializer().serializeToString(ref.current), 'image/svg+xml')
          }
        >
          Схема SVG ↓
        </button>
        <button
          className="button outline"
          onClick={() =>
            save(
              'gaber-components.csv',
              csv([['Поз.', 'Узел', 'Количество', 'Описание'], ...nodes]),
              'text/csv;charset=utf-8'
            )
          }
        >
          Узлы CSV ↓
        </button>
        <button
          className="button outline"
          onClick={() =>
            save(
              'gaber-assembly.json',
              JSON.stringify(
                {mode: 'concept-not-for-manufacturing', config: c, dimensions: d, nodes},
                null,
                2
              ),
              'application/json'
            )
          }
        >
          Пакет JSON ↓
        </button>
      </div>
      <section>
        <h2>Комплектность</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Поз.</th>
                <th>Узел</th>
                <th>Кол-во</th>
                <th>Параметры</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map(([id, name, n, note]) => (
                <tr key={id}>
                  <td>{id}</td>
                  <td>{name}</td>
                  <td>{n}</td>
                  <td>{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="assembly-section">
        <h2>Маршрут сборки</h2>
        <div className="assembly-grid">
          {[
            'Проверить габариты, совместимость узлов, проём доставки и монтажные зазоры.',
            'Изготовить и проверить основу, панели и соединения по утверждённым чертежам.',
            ...(c.storage || c.mechanism !== 'none'
              ? ['Установить короб и механизм. Проверить ход, зазоры и фиксацию по инструкции производителя.']
              : []),
            'Подготовить мягкие слои, раскрой и швы; проверить направление ворса и совмещение рисунка.',
            ...(c.charging || c.lamps
              ? [
                  'Смонтировать электрические модули и кабельные трассы по утверждённой схеме. Проверка специалистом.'
                ]
              : []),
            'Обтянуть узлы, установить чехлы, соединить модули и опоры.',
            'Выполнить контроль качества, комплектности и упаковки.'
          ].map((s, i) => (
            <article key={i}>
              <span className="eyebrow">0{i + 1}</span>
              <p>{s}</p>
            </article>
          ))}
        </div>
      </section>
      <p className="page-disclaimer">
        Пока не рассчитаны: раскрой листов и ткани, толщина несущих элементов, крепёж по артикулам, нагрузки,
        кинематика, масса, центр тяжести и электрическая схема. До запуска производства нужны конструкторская
        документация и согласование технолога.
      </p>
    </main>
  );
}
