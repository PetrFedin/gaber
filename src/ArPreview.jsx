import React, {useEffect, useRef, useState} from 'react';
import {Download, X} from 'lucide-react';

// Просмотр изделия в натуральную величину в комнате клиента.
// Работает на базе <model-viewer>: AR в Chrome на Android (WebXR) и Safari на iPhone (Quick Look).
// На компьютере показывает обычный 3D-просмотр и подсказку, где откроется AR.
// Библиотека тяжёлая (около 1 МБ), поэтому подгружается только по нажатию.
export default function ArPreview({blob, name = 'gaber', onClose}) {
  const viewer = useRef(null);
  const closeRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [canAr, setCanAr] = useState(false);
  const [url, setUrl] = useState('');

  // Ссылку создаём в эффекте: в StrictMode отмена эффекта иначе гасила бы её раньше времени.
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  useEffect(() => {
    let alive = true;
    import('@google/model-viewer/dist/model-viewer.min.js')
      .then(() => alive && setReady(true))
      .catch(() => alive && setError('Не удалось загрузить просмотр. Проверьте соединение и повторите.'));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    closeRef.current?.focus();
    const esc = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [onClose]);

  useEffect(() => {
    const el = viewer.current;
    if (!ready || !el) return;
    const check = () => setCanAr(!!el.canActivateAR);
    el.addEventListener('load', check);
    el.addEventListener('ar-status', check);
    return () => {
      el.removeEventListener('load', check);
      el.removeEventListener('ar-status', check);
    };
  }, [ready]);

  return (
    <div
      className="fq-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Изделие у вас дома"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="fq-modal-card">
        {error && (
          <p className="fq-note fq-error" role="alert">
            {error}
          </p>
        )}
        {!error && !(ready && url) && <p className="fq-note">Загрузка просмотра…</p>}
        {ready && url && (
          <model-viewer
            ref={viewer}
            src={url}
            alt="Ваша конфигурация в натуральную величину"
            ar
            ar-modes="webxr scene-viewer quick-look"
            ar-scale="fixed"
            ar-placement="floor"
            camera-controls
            shadow-intensity="1"
            environment-image="neutral"
            style={{width: '100%', height: 'min(60vh, 560px)', background: 'var(--stage)', borderRadius: 3}}
          >
            {canAr && (
              <button slot="ar-button" className="fq-chip fq-ar-button">
                Поставить в комнату
              </button>
            )}
          </model-viewer>
        )}
        {ready && url && !canAr && (
          <p className="fq-note">
            AR откроется на телефоне: Safari на iPhone или Chrome на Android. Откройте эту страницу с телефона
            и нажмите «Дома у себя».
          </p>
        )}
        <p className="fq-note">
          Размер в AR настоящий и не меняется. Цвет зависит от экрана и освещения комнаты.
        </p>
        <div className="fq-modal-actions">
          <a className="fq-chip" href={url} download={`${name}.glb`}>
            <Download size={14} />
            Скачать модель GLB
          </a>
          <button className="fq-chip" ref={closeRef} onClick={onClose}>
            <X size={14} />
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
