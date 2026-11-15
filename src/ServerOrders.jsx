import React, {useCallback, useEffect, useState} from 'react';
import {getFamily, getFabric} from './domain.js';
import {ORDER_STAGES} from './orderWorkflow.js';
import {serverApi, errorText, randomId} from './serverApi.js';
import {parseOrderKopecks, parseOrderBasisPoints} from './serverOrderMoney.js';

const ROLE_LABELS = {client: 'Клиент', factory: 'Фабрика', partner: 'Партнёр GABER'};
const POSITIVE_MONEY_FIELDS = new Set(['customerPriceKopecks', 'factoryCostKopecks', 'amountKopecks']);
const rub = (k) =>
  k == null ? '—' : new Intl.NumberFormat('ru-RU', {style: 'currency', currency: 'RUB'}).format(k / 100);
const CHANNELS = {
  client: [['client_partner', 'Клиент и GABER'], ['shared', 'Общий канал']],
  factory: [['factory_partner', 'Фабрика и GABER'], ['shared', 'Общий канал']],
  partner: [['client_partner', 'Клиент и GABER'], ['factory_partner', 'Фабрика и GABER'], ['shared', 'Общий канал']]
};
// Эти команды журнал сервера закрывает как действия внешнего полномочия (PRODUCTION HOLD).
export const HOLD_TYPES = new Set(['start', 'complete', 'quality_pass', 'ship', 'deliver', 'accept_delivery']);
const text = (name, label, extra = {}) => ({name, label, ...extra});
const money = (name, label) => text(name, label, {kind: 'money', placeholder: '₽'});

/**
 * Действия по роли и этапу. Это подсказки интерфейса: решение всегда принимает сервер
 * (проверка роли, MFA, этапа, реестра фабрик), а он вернёт понятный код отказа.
 */
const ACTIONS = {
  client: [
    {type: 'accept', label: 'Принять предложение', rev: 'current', when: (o) => o.stage === 'offered'},
    {type: 'request_change', label: 'Запросить изменение', rev: 'current', when: (o) => ['offered', 'accepted'].includes(o.stage), fields: [text('note', 'Что необходимо изменить')]},
    {type: 'report_payment', label: 'Сообщить об оплате', rev: 'current', when: (o) => ['accepted', 'production', 'quality', 'ready'].includes(o.stage), fields: [money('amountKopecks', 'Сумма, ₽'), text('reference', 'Номер платёжного документа')]},
    {type: 'accept_delivery', label: 'Принять доставку', rev: 'current', when: (o) => o.stage === 'delivered'},
    {type: 'report_issue', label: 'Сообщить о проблеме', rev: 'current', when: (o) => ['shipped', 'delivered'].includes(o.stage), fields: [text('note', 'Описание проблемы')]},
    {type: 'reject_resolution', label: 'Отклонить решение', rev: 'current', when: (o) => o.stage === 'disputed' && o.issue?.status === 'response_proposed', fields: [text('note', 'Почему не подходит')]},
    {type: 'confirm_resolution', label: 'Подтвердить решение', rev: 'current', when: (o) => o.stage === 'disputed' && o.issue?.status === 'response_proposed'}
  ],
  partner: [
    {type: 'assign_factory', label: 'Назначить фабрику', when: (o) => !o.assignedFactoryId && ['requested', 'awaiting_factory', 'factory_changes'].includes(o.stage), fields: [text('factoryId', 'Код фабрики из реестра')]},
    {
      type: 'prepare_spec',
      label: 'Подготовить ТЗ и расчёт',
      when: (o) => ['requested', 'change_requested', 'factory_changes', 'offered'].includes(o.stage),
      fields: [
        text('technicalNote', 'Техническое задание', {long: true}),
        money('customerPriceKopecks', 'Цена клиенту, ₽'),
        money('factoryCostKopecks', 'Стоимость у фабрики, ₽'),
        money('platformCommissionKopecks', 'Комиссия GABER, ₽'),
        money('logisticsKopecks', 'Логистика, ₽'),
        money('taxKopecks', 'Налоги, ₽'),
        money('otherCostsKopecks', 'Прочие затраты, ₽'),
        text('advanceBps', 'Аванс, % от цены', {kind: 'percent'}),
        text('dueDate', 'Срок (ГГГГ-ММ-ДД)'),
        text('note', 'Комментарий к предложению')
      ],
      withConfig: true
    },
    {type: 'offer', label: 'Опубликовать предложение клиенту', rev: 'spec', when: (o) => o.stage === 'factory_confirmed', fields: [text('note', 'Комментарий клиенту')]},
    {type: 'record_payment', label: 'Записать оплату', rev: 'current', when: (o) => ['accepted', 'production', 'quality', 'ready'].includes(o.stage), fields: [money('amountKopecks', 'Сумма, ₽'), text('reference', 'Номер платёжного документа')]},
    {type: 'respond_issue', label: 'Ответить на проблему', rev: 'current', when: (o) => o.stage === 'disputed' && o.issue?.status === 'open', fields: [text('note', 'Предложение по решению')]}
  ],
  factory: [
    {type: 'confirm_spec', label: 'Подтвердить ТЗ', rev: 'spec', when: (o) => o.stage === 'awaiting_factory', fields: [text('reference', 'Номер подтверждения'), text('note', 'Комментарий')]},
    {type: 'return_spec', label: 'Вернуть ТЗ на доработку', rev: 'spec', when: (o) => o.stage === 'awaiting_factory', fields: [text('note', 'Что нужно исправить')]},
    {type: 'start', label: 'Начать производство', rev: 'current', when: (o) => o.stage === 'accepted'},
    {type: 'complete', label: 'Производство завершено', rev: 'current', when: (o) => o.stage === 'production'},
    {type: 'quality_pass', label: 'Контроль качества пройден', rev: 'current', when: (o) => o.stage === 'quality', fields: [text('reference', 'Номер акта')]},
    {type: 'ship', label: 'Отгрузить', rev: 'current', when: (o) => o.stage === 'ready', fields: [text('carrier', 'Перевозчик'), text('tracking', 'Трек-номер'), text('reference', 'Номер документа')]},
    {type: 'deliver', label: 'Доставлено', rev: 'current', when: (o) => o.stage === 'shipped', fields: [text('reference', 'Номер документа')]},
    {type: 'respond_issue', label: 'Ответить на проблему', rev: 'current', when: (o) => o.stage === 'disputed' && o.issue?.status === 'open', fields: [text('note', 'Предложение по решению')]}
  ]
};

function Field({field, value, onChange}) {
  const Tag = field.long ? 'textarea' : 'input';
  return (
    <label className="advanced-field">
      {field.label}
      <Tag value={value ?? ''} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function ActionForm({action, order, role, busy, onRun}) {
  const [values, setValues] = useState({});
  const set = (name, v) => setValues((s) => ({...s, [name]: v}));
  const submit = (e) => {
    e.preventDefault();
    const payload = {};
    for (const f of action.fields ?? []) {
      const raw = values[f.name] ?? '';
      try {
        payload[f.name] = f.kind === 'money'
          ? parseOrderKopecks(raw, {positive: POSITIVE_MONEY_FIELDS.has(f.name), allowEmpty: !POSITIVE_MONEY_FIELDS.has(f.name)})
          : f.kind === 'percent'
            ? parseOrderBasisPoints(raw, {allowEmpty: true})
            : String(raw).trim();
      } catch (error) {
        const help = f.kind === 'money'
          ? 'сумма в рублях, максимум две цифры после запятой, без округления'
          : 'процент от 0 до 100, максимум две цифры после запятой';
        return onRun(null, null, `Проверьте поле «${f.label}»: ${help}.`);
      }
    }
    if (action.withConfig) payload.config = order.config;
    const revisionId = action.rev === 'spec' ? order.factoryTask?.specId : action.rev === 'current' ? order.revisionId : undefined;
    onRun({type: action.type, payload, revisionId});
  };
  return (
    <form className="server-action" onSubmit={submit}>
      {(action.fields ?? []).map((f) => (
        <Field key={f.name} field={f} value={values[f.name]} onChange={(v) => set(f.name, v)} />
      ))}
      <button className="button dark" disabled={busy}>{action.label}</button>
    </form>
  );
}

function MessageForm({role, order, busy, onRun}) {
  const [note, setNote] = useState('');
  const [channel, setChannel] = useState(CHANNELS[role][0][0]);
  return (
    <form
      className="server-action"
      onSubmit={(e) => {
        e.preventDefault();
        onRun({type: 'message', payload: {note: note.trim(), channel}, revisionId: order.revisionId ?? undefined}, () => setNote(''));
      }}
    >
      <label className="advanced-field">
        Канал
        <select value={channel} onChange={(e) => setChannel(e.target.value)}>
          {CHANNELS[role].map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </label>
      <label className="advanced-field">
        Сообщение
        <textarea value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <button className="button outline" disabled={busy || !note.trim()}>Отправить сообщение</button>
    </form>
  );
}

function OrderCard({order, role, busy, onRun, holdDisabled}) {
  const family = getFamily(order.config ?? {}) ?? null;
  const fabric = order.config ? getFabric(order.config) : null;
  const all = ACTIONS[role].filter((a) => a.when(order));
  const actions = holdDisabled ? all.filter((a) => !HOLD_TYPES.has(a.type)) : all;
  const held = holdDisabled ? all.filter((a) => HOLD_TYPES.has(a.type)) : [];
  return (
    <article className="server-order">
      <header>
        <div>
          <span className="eyebrow">{order.orderId}</span>
          <h3>{order.name}</h3>
          <p>
            {family?.name ?? 'Изделие'} · {order.config?.width}×{order.config?.depth}×{order.config?.height} см{fabric ? ` · ${fabric.name}` : ''}
          </p>
        </div>
        <span className="status amber">{ORDER_STAGES[order.stage] ?? order.stage}</span>
      </header>
      {order.externalExecution && (
        <p className="inline-warning" role="note" data-order-evidence={order.externalExecution.provenance}>
          {order.externalExecution.provenance === 'DEV_SIMULATED_EXTERNAL_AUTHORITY'
            ? `DEV-СИМУЛЯЦИЯ: ${order.externalExecution.eventCount} этапов производства/доставки имитированы и зафиксированы в журнале. Это не доказательство реальных операций.`
            : 'ВНИМАНИЕ: журнал содержит прежние внешние операции без подтверждённого происхождения. Реальное производство и доставка не доказаны.'}
        </p>
      )}
      <dl className="server-facts">
        <div><dt>Версия журнала</dt><dd>{order.version}</dd></div>
        {order.offer && <div><dt>Цена предложения</dt><dd>{rub(order.offer.priceKopecks)}</dd></div>}
        {order.finance?.advanceDueKopecks != null && <div><dt>Аванс к оплате</dt><dd>{rub(order.finance.advanceDueKopecks)}</dd></div>}
        {order.finance?.localRecordedKopecks != null && <div><dt>Учтено партнёром (не банк)</dt><dd>{rub(order.finance.localRecordedKopecks)}</dd></div>}
        {order.finance?.balanceKopecks != null && <div><dt>Остаток к оплате</dt><dd>{rub(order.finance.balanceKopecks)}</dd></div>}
        {role === 'factory' && order.factoryTask && <div><dt>Стоимость у фабрики</dt><dd>{rub(order.factoryTask.factoryCostKopecks)}</dd></div>}
        {role === 'factory' && order.dueDate && <div><dt>Срок</dt><dd>{order.dueDate}</dd></div>}
        {role === 'partner' && order.economics && <div><dt>Цена клиенту / у фабрики</dt><dd>{rub(order.economics.customerPriceKopecks)} / {rub(order.economics.factoryCostKopecks)}</dd></div>}
        {role === 'partner' && <div><dt>Фабрика</dt><dd>{order.assignedFactoryId ?? 'не назначена'}</dd></div>}
      </dl>
      {(order.paymentClaims?.length > 0 || order.payments?.length > 0) && (
        <ul className="server-messages" aria-label="Платежи">
          {(order.payments ?? []).map((p, i) => (
            <li key={'p' + i}><b>Учтено:</b> {rub(p.amountKopecks)} · {p.reference}</li>
          ))}
          {(order.paymentClaims ?? []).map((p, i) => (
            <li key={'c' + i}><b>Заявлено клиентом:</b> {rub(p.amountKopecks)} · {p.reference}</li>
          ))}
        </ul>
      )}
      {held.length > 0 && (
        <p className="inline-warning" role="note">
          PRODUCTION HOLD: этап «{held.map((a) => a.label).join(', ')}» закрыт для этой роли. Журнал сервера требует внешнего подтверждения (банк, допуск производства, перевозчик), его в системе пока нет.
        </p>
      )}
      {order.messages?.length > 0 && (
        <ul className="server-messages" aria-label="Сообщения">
          {order.messages.map((m, i) => (
            <li key={i}><b>{ROLE_LABELS[m.role] ?? m.role}:</b> {m.note}</li>
          ))}
        </ul>
      )}
      <p className="helper">Данные демонстрационные. Запись подтверждает только журнал сервера; оплата и производство не подтверждены.</p>
      <div className="server-actions">
        {actions.map((a) => (
          <ActionForm key={a.type} action={a} order={order} role={role} busy={busy} onRun={(cmd, after, localError) => onRun(cmd, after, localError)} />
        ))}
        <MessageForm role={role} order={order} busy={busy} onRun={onRun} />
      </div>
    </article>
  );
}

/** Подтверждение входа вторым фактором: подключение приложения-аутентификатора или ввод текущего кода. */
function MfaPanel({user, onChange, setError}) {
  const [secret, setSecret] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const enrolled = user.mfa.enrolled;
  async function run(fn) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const refresh = async () => onChange((await serverApi.me()).user);
  return (
    <section className="server-mfa" role="region" aria-label="Подтверждение входа">
      <h2>Подтвердите вход кодом</h2>
      <p>
        Для роли «{ROLE_LABELS[user.role]}» записи в заказ требуют второго фактора. Откройте приложение-аутентификатор
        {enrolled ? ' и введите текущий шестизначный код.' : ', добавьте ключ ниже и введите код из приложения.'}
      </p>
      {!enrolled && !secret && (
        <button className="button outline" disabled={busy} onClick={() => run(async () => setSecret(await serverApi.mfaEnroll()))}>
          Подключить аутентификатор
        </button>
      )}
      {!enrolled && secret && (
        <dl className="server-facts">
          <div>
            <dt>Ключ для приложения</dt>
            <dd>{secret.secret.match(/.{1,4}/g).join(' ')}</dd>
          </div>
          <div>
            <dt>Ссылка otpauth</dt>
            <dd className="server-uri">{secret.uri}</dd>
          </div>
        </dl>
      )}
      {(enrolled || secret) && (
        <form
          className="server-action"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await (enrolled ? serverApi.mfaVerify(code.trim()) : serverApi.mfaConfirm(code.trim()));
              setCode('');
              await refresh();
            });
          }}
        >
          <label className="advanced-field">
            Код из приложения
            <input value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={6} onChange={(e) => setCode(e.target.value)} />
          </label>
          <button className="button dark" disabled={busy || code.trim().length !== 6}>
            {enrolled ? 'Проверить код' : 'Подтвердить и подключить'}
          </button>
        </form>
      )}
      <p className="helper">В режиме разработки сервер может считать вторую проверку пройденной: тогда этот блок не показывается.</p>
    </section>
  );
}

function LoginForm({onDone, busy, setBusy, setError}) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return (
    <form
      className="server-login"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
          onDone(mode === 'login' ? await serverApi.login(email, password) : await serverApi.register(email, password));
        } catch (err) {
          setError(errorText(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>{mode === 'login' ? 'Вход' : 'Регистрация клиента'}</h2>
      <label className="advanced-field">Почта<input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label className="advanced-field">Пароль<input type="password" required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <div className="server-actions">
        <button className="button dark" disabled={busy}>{mode === 'login' ? 'Войти' : 'Зарегистрироваться'}</button>
        <button type="button" className="button outline" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'Создать аккаунт клиента' : 'Уже есть аккаунт'}
        </button>
      </div>
      <p className="helper">Регистрация создаёт только клиента. Фабрики и партнёры заводятся администратором. Не вводите конфиденциальные данные: система не готова к реальным заказам.</p>
    </form>
  );
}

/** Рабочее пространство заказов на сервере: вход, список и действия по ролям. Источник истины — журнал сервера. */
export default function ServerOrders({config, holdDisabled: holdOverride}) {
  const [user, setUser] = useState(undefined);
  const [serverInfo, setServerInfo] = useState({});
  // Закрытые HOLD этапы показываются только если сервер сам сообщил о dev-имитации внешних полномочий.
  const holdDisabled = holdOverride ?? !serverInfo.devSimulatedAuthority;
  const [orders, setOrders] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [name, setName] = useState('');
  const role = user?.role;
  const refresh = useCallback(async () => {
    try {
      setOrders(await serverApi.listOrders());
    } catch (e) {
      if (e.status === 401) setUser(null);
      setError(errorText(e));
    }
  }, []);
  useEffect(() => {
    serverApi.me().then((r) => {
      setUser(r.user);
      setServerInfo(r.server);
    }).catch((e) => {
      setUser(null);
      if (e.code === 'SERVER_UNAVAILABLE') setError(errorText(e));
    });
  }, []);
  useEffect(() => {
    if (user) refresh();
    else setOrders([]);
  }, [user, refresh]);
  async function run(order, cmd, after, localError) {
    if (!cmd) return setError(localError);
    setBusy(true);
    setError('');
    setNote('');
    try {
      await serverApi.command({orderId: order.orderId, expectedVersion: order.version, ...cmd});
      after?.();
      setNote('Готово: действие записано в журнал заказа.');
    } catch (e) {
      setError(errorText(e));
    } finally {
      await refresh();
      setBusy(false);
    }
  }
  async function createOrder() {
    setBusy(true);
    setError('');
    setNote('');
    try {
      const orderId = randomId('ORD');
      await serverApi.command({orderId, type: 'create', expectedVersion: 0, payload: {projectId: orderId, name: name.trim() || 'Заказ из конструктора', config}});
      setName('');
      setNote('Заказ создан на сервере.');
    } catch (e) {
      setError(errorText(e));
    } finally {
      await refresh();
      setBusy(false);
    }
  }
  return (
    <main className="page server-orders">
      <div className="page-top">
        <div>
          <span className="eyebrow">ЗАКАЗЫ НА СЕРВЕРЕ · ДЕМО · PRODUCTION HOLD</span>
          <h1>Заказы</h1>
          <p>Клиент, партнёр GABER и фабрика работают с одним журналом на сервере. Каждая роль видит только свои данные.</p>
        </div>
        {user && (
          <div className="server-session">
            <span>{user.email} · {ROLE_LABELS[user.role]}</span>
            <button className="button outline" onClick={refresh} disabled={busy}>Обновить</button>
            <button
              className="button outline"
              onClick={async () => {
                await serverApi.logout().catch(() => {});
                setUser(null);
                setNote('Вы вышли.');
              }}
            >
              Выйти
            </button>
          </div>
        )}
      </div>
      {serverInfo.devSimulatedAuthority && (
        <div className="inline-warning" role="note" data-dev-simulation="external-authority">
          DEV-СИМУЛЯТОР: сервер имитирует внешние полномочия (производство, контроль качества, отгрузка, доставка). Банк не имитируется, оплата не подтверждается. Это не реальные операции и не допуск в производство.
        </div>
      )}
      {error && <div className="inline-warning" role="alert">{error}</div>}
      {note && <div className="small-note" role="status">{note}</div>}
      {user === undefined && <p className="helper">Проверяем сессию…</p>}
      {user === null && <LoginForm
          onDone={(u) => {
            setUser(u);
            serverApi.me().then((r) => {
              setUser(r.user ?? u);
              setServerInfo(r.server);
            }).catch(() => {});
          }}
          busy={busy} setBusy={setBusy} setError={setError} />}
      {user?.mfa?.required && !user.mfa.verified && <MfaPanel user={user} onChange={setUser} setError={setError} />}
      {user && role === 'client' && (
        <section className="server-create">
          <h2>Новый заказ из конструктора</h2>
          <label className="advanced-field">Название заказа<input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></label>
          <button className="button dark" disabled={busy} onClick={createOrder}>Создать заказ на сервере</button>
        </section>
      )}
      {user && (
        <section>
          <h2>{role === 'client' ? 'Мои заказы' : role === 'factory' ? 'Назначенные заказы' : 'Все заказы оператора'}</h2>
          {orders.length === 0 && <p className="helper">Заказов пока нет.</p>}
          {orders.map((o) => (
            <OrderCard key={o.orderId + ':' + o.version} order={o} role={role} busy={busy} holdDisabled={holdDisabled} onRun={(cmd, after, localError) => run(o, cmd, after, localError)} />
          ))}
        </section>
      )}
    </main>
  );
}
