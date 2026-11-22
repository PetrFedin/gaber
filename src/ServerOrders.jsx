import React, {useCallback, useEffect, useState} from 'react';
import {getFamily, getFabric, fabrics, colors, bounds,validate} from './domain.js';
import {getInvestorDemoTemplates} from './investorDemo.js';
import DevStockPanel from './DevStockPanel.jsx';
import {PackoutForm,ReceiptForm,CorrectionForm,InspectionSummary} from './ServerFulfillment.jsx';
import {SERVER_ORDER_SYNC_MS,shouldSyncOrders,sameOrderVersions} from './orderAutoSync.js';
import {buildServerSpecConfig, getServerDemoCatalog,serverCreateCommand} from './serverSpecBridge.js';
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
    {type: 'accept_delivery', label: 'Принять доставку', rev: 'current', when: (o) => o.stage === 'delivered' &&
      (!o.fulfillmentRequired || o.fulfillment?.receipt?.status === 'matched_unverified') &&
      (!o.fulfillment?.receipt || o.fulfillment.receipt.status === 'matched_unverified')},
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
    {type: 'respond_issue', label: 'Ответить на проблему', rev: 'current', when: (o) => o.stage === 'disputed' && o.issue?.status === 'open' && !o.issue?.receiptId, fields: [text('note', 'Предложение по решению')]}
  ],
  factory: [
    {type: 'confirm_spec', label: 'Подтвердить ТЗ', rev: 'spec', when: (o) => o.stage === 'awaiting_factory', fields: [text('reference', 'Номер подтверждения'), text('note', 'Комментарий')]},
    {type: 'return_spec', label: 'Вернуть ТЗ на доработку', rev: 'spec', when: (o) => o.stage === 'awaiting_factory', fields: [text('note', 'Что нужно исправить')]},
    {type: 'start', label: 'Начать производство', rev: 'current', when: (o) => o.stage === 'accepted'},
    {type: 'complete', label: 'Производство завершено', rev: 'current', when: (o) => o.stage === 'production'},
    {type: 'quality_pass', label: 'Контроль качества пройден', rev: 'current', when: (o) => o.stage === 'quality', fields: [text('reference', 'Номер акта')]},
    {type: 'ship', label: 'Отгрузить', rev: 'current', when: (o) => o.stage === 'ready' &&
      (!o.fulfillmentRequired || o.fulfillment?.packout?.complete === true) &&
      o.fulfillment?.packout?.complete !== false, fields: [text('carrier', 'Перевозчик'), text('tracking', 'Трек-номер'), text('reference', 'Номер документа')]},
    {type: 'deliver', label: 'Доставлено', rev: 'current', when: (o) => o.stage === 'shipped', fields: [text('reference', 'Номер документа')]},
    {type: 'respond_issue', label: 'Ответить на проблему', rev: 'current', when: (o) => o.stage === 'disputed' && o.issue?.status === 'open' && !o.issue?.receiptId, fields: [text('note', 'Предложение по решению')]}
  ]
};

function Field({field, value, onChange}) {
  const Tag = field.long ? 'textarea' : 'input';
  return (
    <label className="advanced-field">
      {field.label}
      <Tag name={field.name} value={value ?? ''} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function ActionForm({action, order, role, busy, onRun}) {
  const [values, setValues] = useState({});
  const [configurationEdits,setConfigurationEdits] = useState({});
  const set = (name, v) => setValues((s) => ({...s, [name]: v}));
  const changeConfiguration=(field,value)=>setConfigurationEdits(s=>({...s,[field]:value}));
  const submit = (e) => {
    e.preventDefault();
    // Read the values actually present in the submitted form. React may still
    // be reconciling controlled state after a geometry edit; never send a
    // partially cleared commercial quote from a previous revision.
    const submitted = new e.currentTarget.ownerDocument.defaultView.FormData(e.currentTarget);
    const payload = {};
    for (const f of action.fields ?? []) {
      const input = submitted.get(f.name);
      const raw = typeof input === 'string' ? input : '';
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
    if (action.withConfig){
      try{payload.config=buildServerSpecConfig(order.config,configurationEdits);}
      catch{return onRun(null,null,'Проверьте размеры, материал и механизм изделия. Данные ТЗ не отправлены.');}
    }
    const revisionId = action.rev === 'spec' ? order.factoryTask?.specId : action.rev === 'current' ? order.revisionId : undefined;
    onRun({type: action.type, payload, revisionId});
  };
  return (
    <form className="server-action" onSubmit={submit}>
      {action.withConfig && order.config && <fieldset className="server-spec-geometry">
        <legend>Уточнение конструкции для новой ревизии ТЗ</legend>
        <p className="helper">Изменения размеров и материала попадут в новое ТЗ. Старая цена и согласование фабрики не переносятся.</p>
        {['width','depth','height'].map(field=>{
          const limits=field==='width' ? [getFamily(order.config)?.min,getFamily(order.config)?.max,getFamily(order.config)?.step]
            : bounds(order.config)[field];
          return <label className="advanced-field" key={field}>
            {{width:'Ширина, см',depth:'Глубина, см',height:'Высота, см'}[field]}
            <input type="number" step={limits?.[2]??1} min={limits?.[0]} max={limits?.[1]}
              value={configurationEdits[field]??order.config[field]}
              onChange={e=>changeConfiguration(field,e.target.value.trim()===''?NaN:Number(e.target.value))}/>
          </label>;
        })}
        <label className="advanced-field">Ткань
          <select value={configurationEdits.fabric??order.config.fabric} onChange={e=>changeConfiguration('fabric',e.target.value)}>
            {fabrics.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
        <label className="advanced-field">Цвет
          <select value={configurationEdits.color??order.config.color} onChange={e=>changeConfiguration('color',e.target.value)}>
            {colors.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        {order.config.category==='sofa' && <label className="advanced-field">Модулей
          <input type="number" min="2" max="5" step="1" value={configurationEdits.moduleCount??order.config.moduleCount}
            onChange={e=>changeConfiguration('moduleCount',e.target.value.trim()===''?NaN:Number(e.target.value))}/>
        </label>}
        {order.config.category==='chairbed' && <label className="advanced-field">Механизм
          <select value={configurationEdits.mechanism??order.config.mechanism} onChange={e=>changeConfiguration('mechanism',e.target.value)}>
            <option value="fold">Раскладной</option><option value="slide">Выдвижной</option>
          </select>
        </label>}
        {order.config.category==='bed' && <label className="advanced-field">Ящик хранения
          <input type="checkbox" checked={configurationEdits.storage??order.config.storage}
            onChange={e=>changeConfiguration('storage',e.target.checked)}/>
        </label>}
      </fieldset>}
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

function OrderCard({order, role, busy, onRun, holdDisabled,onInspectOrder,stockEnabled=false}) {
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
      <InspectionSummary order={order}/>
      {stockEnabled&&<DevStockPanel order={order} role={role}/>}

      {order.fulfillmentRequired && order.stage==='ready' && !order.fulfillment?.packout?.complete &&
       <p className="inline-warning" role="note">Отгрузка закрыта: фабрика должна зафиксировать полную комплектацию по BOM.</p>}
      {order.fulfillmentRequired && order.stage==='delivered' &&
        order.fulfillment?.receipt?.status!=='matched_unverified' &&
       <p className="inline-warning" role="note">Закрытие заказа невозможно без отдельной приёмки по количествам и повреждениям.</p>}
      <p className="helper">Данные демонстрационные. Запись подтверждает только журнал сервера; оплата и производство не подтверждены.</p>
      {order.config && onInspectOrder && <div className="server-actions">
        <button className="button outline" type="button" onClick={()=>onInspectOrder({
          section:'technical',orderId:order.orderId,revisionId:order.revisionId,
          config:order.config,source:'SERVER_ORDER_JOURNAL_PROJECTION'
        })}>Инженерный паспорт именно этого заказа</button>
      </div>}
      <div className="server-actions">
        {role==='factory'&&order.stage==='ready'&&order.fulfillment?.plan&&
          <PackoutForm key={order.orderId+':'+(order.fulfillment.packout?.reference??'new')}
            order={order} busy={busy} onRun={onRun}/>}
        {role==='client'&&order.stage==='delivered'&&order.fulfillment?.packout?.complete&&
          (!order.fulfillment.receipt||order.fulfillment.correctionPending)&&
          <ReceiptForm key={order.orderId+':'+(order.fulfillment.receipt?.reference??'new')}
            order={order} busy={busy} onRun={onRun}/>}
        {['factory','partner'].includes(role)&&order.stage==='disputed'&&order.issue?.status==='open'&&
          order.issue.receiptId&&
          <CorrectionForm key={order.orderId+':'+order.issue.id} order={order} busy={busy} onRun={onRun}/>}
        {actions.map((a) => (
          <ActionForm key={a.type+':'+(order.revisionId??order.factoryTask?.specId??'unpriced')} action={a} order={order} role={role} busy={busy} onRun={(cmd, after, localError) => onRun(cmd, after, localError)} />
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
export default function ServerOrders({config, holdDisabled: holdOverride,onInspectOrder}) {
  const [user, setUser] = useState(undefined);
  const [serverInfo, setServerInfo] = useState({});
  // Закрытые HOLD этапы показываются только если сервер сам сообщил о dev-имитации внешних полномочий.
  const holdDisabled = holdOverride ?? !serverInfo.devSimulatedAuthority;
  const [orders, setOrders] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [name, setName] = useState('');
  const [presetId,setPresetId] = useState('');
  const presetCatalog = React.useMemo(()=>getServerDemoCatalog(getInvestorDemoTemplates()),[]);
  // A lost HTTP response must retry the SAME create ID+requestId to prevent
  // duplicate user orders. Editing the draft explicitly starts a new request.
  const pendingCreate = React.useRef(null);
  const submitting = React.useRef(false);
  const [retryPending,setRetryPending] = useState(false);
  const resetCreate=()=>{pendingCreate.current=null;setRetryPending(false);};
  // Changing the active studio configuration is an explicit new draft choice;
  // never silently retry an older unknown-response payload as a new model.
  useEffect(()=>{pendingCreate.current=null;setRetryPending(false);},[config]);
  const role = user?.role;
  const currentSession=React.useRef(null);
  // Read responses from an earlier login/logout cannot paint a new user's
  // list, including when network requests resolve out of order.
  currentSession.current=user?.email??null;
  const refreshInFlight=React.useRef(null);
  const refresh=useCallback(async (options={})=>{
    // Never let an old user's request repaint a newly authenticated cabinet.
    const previous=refreshInFlight.current;
    if(previous){
      await previous;
      // A mutation MUST obtain a new snapshot after earlier reads settle.
      if(!options?.afterWrite)return;
    }
    const key=currentSession.current;
    if(!key)return;
    const work=(async()=>{
      try{
        const fresh=await serverApi.listOrders();
        if(currentSession.current===key)
          setOrders(old=>sameOrderVersions(old,fresh)?old:fresh);
      }catch(e){
        if(currentSession.current===key){
          if(e.status===401)setUser(null);
          else if(e.code!=='SERVER_UNAVAILABLE')setError(errorText(e));
        }
      }
    })();
    refreshInFlight.current=work;
    try{await work;}finally{
      if(refreshInFlight.current===work)refreshInFlight.current=null;
    }
  },[]);
  useEffect(()=>{
    if(!user)return;
    const sync=()=>{
      const element=document.activeElement;
      const editing=Boolean(element?.matches?.('input,textarea,select,[contenteditable="true"]') &&
        element.closest?.('.server-orders'));
      if(shouldSyncOrders({authenticated:Boolean(currentSession.current),busy,
         hidden:document.hidden,editing}))void refresh();
    };
    const timer=window.setInterval(sync,SERVER_ORDER_SYNC_MS);
    window.addEventListener('focus',sync);
    document.addEventListener('visibilitychange',sync);
    return ()=>{
      window.clearInterval(timer);
      window.removeEventListener('focus',sync);
      document.removeEventListener('visibilitychange',sync);
    };
  },[user,busy,refresh]);
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
  const actionInFlight=React.useRef(false);
  async function run(order,cmd,after,localError){
    if(!cmd){setError(localError);return;}
    // React busy state updates asynchronously: block same-tick double clicks.
    if(actionInFlight.current)return;
    actionInFlight.current=true;
    setBusy(true);setError('');setNote('');
    try{
      await serverApi.command({orderId:order.orderId,expectedVersion:order.version,...cmd});
      after?.();
      setNote('Готово: действие записано в журнал заказа.');
    }catch(e){setError(errorText(e));}
    finally{
      try{await refresh({afterWrite:true});}
      finally{actionInFlight.current=false;setBusy(false);}
    }
  }
  async function createOrder() {
    if(submitting.current)return;
    submitting.current=true;
    setBusy(true);
    setError('');
    setNote('');
    try {
      const preset=presetCatalog.find(p=>p.id===presetId);
      const source=preset?.config??config;
      if(validate(source).length)throw Object.assign(Error('CONFIG_INVALID'),{code:'CONFIG_INVALID'});
      if(!pendingCreate.current){
        pendingCreate.current=serverCreateCommand({
          orderId:randomId('ORD'),requestId:randomId('REQ'),
          name:name.trim()||preset?.name||'Заказ из конструктора',config:source
        });
      }
      const submitted=pendingCreate.current;
      await serverApi.command(submitted);
      resetCreate();
      setName('');setPresetId('');
      setNote('Создана новая серверная заявка без переноса локальных оплат, цены и этапов демо.');
    } catch (e) {
      setError(errorText(e));
      // A network timeout may mean the request DID commit: preserve the same
      // request ID for the retry. Other 4xx errors are not ambiguous.
      if(e?.code==='SERVER_UNAVAILABLE'||(e?.status>=500&&e?.status<600))
        setRetryPending(Boolean(pendingCreate.current));
      else resetCreate();
    } finally {
      await refresh({afterWrite:true});
      setBusy(false);
      submitting.current=false;
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
            <span className="helper" title="Автоматическое обновление активного кабинета каждые 7 секунд, кроме редактирования">Автообновление · 7 с</span>
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
          <label className="advanced-field">Исходная конфигурация
            <select aria-label="Исходная конфигурация сервера" value={presetId}
              onChange={e=>{setPresetId(e.target.value);resetCreate();}}>
              <option value="">Текущий проект конструктора</option>
              {presetCatalog.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="advanced-field">Название заказа<input value={name} maxLength={120}
            onChange={(e) => {setName(e.target.value);resetCreate();}} /></label>
          <p className="helper">Пять исходных моделей передают только выбранную геометрию и обивку. Сервер создаёт новую заявку с нулевой историей — без переноса локальных цен, оплат, подтверждений и отгрузок.</p>
          {retryPending && <p className="inline-warning" role="note">Предыдущий ответ сервера не получен. Повторная отправка использует тот же идентификатор запроса, чтобы не дублировать заказ.</p>}
          <button className="button dark" disabled={busy} onClick={createOrder}>{retryPending?'Повторить ту же заявку':'Создать заказ на сервере'}</button>
        </section>
      )}
      {user && (
        <section>
          <h2>{role === 'client' ? 'Мои заказы' : role === 'factory' ? 'Назначенные заказы' : 'Все заказы оператора'}</h2>
          {orders.length === 0 && <p className="helper">Заказов пока нет.</p>}
          {orders.map((o) => (
            <OrderCard key={o.orderId+':'+role} order={o} role={role} busy={busy} holdDisabled={holdDisabled}
              stockEnabled={Boolean(serverInfo.devSimulatedAuthority)}
              onInspectOrder={onInspectOrder} onRun={(cmd, after, localError) => run(o, cmd, after, localError)} />
          ))}
        </section>
      )}
    </main>
  );
}
