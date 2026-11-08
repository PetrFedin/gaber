import React, {useEffect, useRef, useState} from 'react';
import {ShieldCheck, Camera, User, Armchair, ZoomIn, Check, X, Download, ChevronDown} from 'lucide-react';
import {LIGHT_PRESETS, QUALITY} from './fidelity.js';

const ANGLES = [
  ['front', 'Спереди'],
  ['side', 'Сбоку'],
  ['back', 'Сзади'],
  ['top', 'Сверху']
];
const CAN_SIT = ['sofa', 'chair', 'chairbed'];

// Панель «Проверьте перед заказом»: помогает клиенту увидеть изделие так,
// как оно будет выглядеть дома, и честно показывает, что на картинке точно,
// а что приблизительно. Ничего не блокирует и не торопит: заказать можно в любой момент.
export default function QualityDock({sceneRef, view, setView, inspected, category, name = 'gaber'}) {
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState('');
  const closeRef = useRef(null);
  const canSit = CAN_SIT.includes(category);

  const angleDone = ANGLES.filter(([k]) => inspected.has('angle:' + k)).length;
  const lightDone = Object.keys(LIGHT_PRESETS).filter((k) => inspected.has('light:' + k)).length;
  const groups = [
    angleDone === ANGLES.length,
    lightDone === Object.keys(LIGHT_PRESETS).length,
    inspected.has('person'),
    inspected.has('close'),
    ...(canSit ? [inspected.has('sit')] : [])
  ];
  const done = groups.filter(Boolean).length;

  useEffect(
    () => () => {
      if (photo?.url) URL.revokeObjectURL(photo.url);
    },
    [photo]
  );
  useEffect(() => {
    if (!photo) return;
    closeRef.current?.focus();
    const esc = (e) => {
      if (e.key === 'Escape') setPhoto(null);
    };
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [photo]);

  const shoot = async () => {
    setError('');
    setProgress(0);
    try {
      const result = await sceneRef.current.photo({onProgress: setProgress});
      setPhoto(result);
    } catch (e) {
      setError(e.message || 'Не удалось сделать фото');
    } finally {
      setProgress(null);
    }
  };

  const set = (patch) => setView((v) => ({...v, ...patch}));
  const Tick = ({on}) =>
    on ? (
      <Check size={14} className="fq-tick" aria-label="проверено" />
    ) : (
      <span className="fq-dot" aria-hidden="true" />
    );

  return (
    <div className="fq">
      <button className="fq-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <ShieldCheck size={16} />
        <span>
          Проверка · {done} из {groups.length}
        </span>
        <ChevronDown size={14} className={open ? 'fq-flip' : ''} />
      </button>

      {open && (
        <div className="fq-panel" role="group" aria-label="Проверка перед заказом">
          <p className="fq-lead">
            Что стоит посмотреть, чтобы получить именно то, что видите. Это подсказки: заказать можно в любой
            момент.
          </p>

          <h4>
            Ракурсы{' '}
            <small>
              {angleDone} из {ANGLES.length}
            </small>
          </h4>
          <div className="fq-row">
            {ANGLES.map(([k, label]) => (
              <button key={k} className="fq-chip" onClick={() => sceneRef.current?.view(k)}>
                <Tick on={inspected.has('angle:' + k)} />
                {label}
              </button>
            ))}
          </div>

          <h4>
            Свет <small>цвет меняется от освещения</small>
          </h4>
          <div className="fq-row">
            {Object.entries(LIGHT_PRESETS).map(([k, p]) => (
              <button
                key={k}
                className="fq-chip"
                aria-pressed={view.light === k}
                onClick={() => set({light: k})}
              >
                <Tick on={inspected.has('light:' + k)} />
                {p.label}
              </button>
            ))}
          </div>

          <h4>Масштаб и посадка</h4>
          <div className="fq-row">
            <button
              className="fq-chip"
              aria-pressed={view.person}
              onClick={() => set({person: !view.person})}
            >
              <User size={14} />
              Человек 175 см
              <Tick on={inspected.has('person')} />
            </button>
            <button
              className="fq-chip"
              aria-pressed={view.sit && canSit}
              disabled={!canSit}
              onClick={() => set({sit: !view.sit})}
            >
              <Armchair size={14} />
              Присесть
              <Tick on={inspected.has('sit')} />
            </button>
            <button className="fq-chip" onClick={() => sceneRef.current?.view('close')}>
              <ZoomIn size={14} />
              Ткань вблизи
              <Tick on={inspected.has('close')} />
            </button>
          </div>
          {!canSit && <p className="fq-note">Посадка показывается для дивана и кресел.</p>}

          <h4>Качество изображения</h4>
          <div className="fq-row">
            {Object.entries(QUALITY).map(([k, q]) => (
              <button
                key={k}
                className="fq-chip"
                aria-pressed={view.quality === k}
                onClick={() => set({quality: k})}
              >
                {q.label}
              </button>
            ))}
          </div>
          <p className="fq-note">
            Высокое: объёмные подушки, затенение в складках, тени в 2 раза чётче. Нагружает видеокарту.
          </p>

          <button className="fq-chip fq-wide" disabled={progress !== null} onClick={shoot}>
            <Camera size={14} />
            {progress === null ? 'Фото 2400 × 1600' : `Съёмка ${Math.round(progress * 100)}%`}
          </button>
          {error && (
            <p className="fq-note fq-error" role="alert">
              {error}
            </p>
          )}

          <details className="fq-honest">
            <summary>Что на картинке точно, а что нет</summary>
            <p>
              <b>Точно:</b> габариты и пропорции, число модулей, форма и расположение деталей, выбранные ткань
              и цвет из каталога.
            </p>
            <p>
              <b>Приблизительно:</b> оттенок на вашем экране, мягкость и фактура ткани, складки подушек, швы и
              кант, просадка сиденья.
            </p>
            <p>
              Перед заказом сверьте цвет с образцом ткани при вашем освещении. Образцы запрашивайте у фабрики.
            </p>
          </details>
        </div>
      )}

      {photo && (
        <div
          className="fq-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Фото изделия"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPhoto(null);
          }}
        >
          <div className="fq-modal-card">
            <img src={photo.url} alt="Фото вашей конфигурации" />
            <div className="fq-modal-actions">
              <a className="fq-chip" href={photo.url} download={`${name}-photo.png`}>
                <Download size={14} />
                Скачать PNG
              </a>
              <button className="fq-chip" ref={closeRef} onClick={() => setPhoto(null)}>
                <X size={14} />
                Закрыть
              </button>
            </div>
            <p className="fq-note">Цифровая визуализация. Оттенок и фактура на изделии могут отличаться.</p>
          </div>
        </div>
      )}
    </div>
  );
}
