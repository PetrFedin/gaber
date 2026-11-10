import React, { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  Minus,
  Check,
  ChevronRight,
  X,
  RotateCcw,
  Maximize2,
  Move3D,
  Layers,
  SlidersHorizontal,
  Armchair,
  Grid2X2,
  Bookmark,
  Download,
  Share2,
  Clock,
  Package,
  CheckCircle2,
  AlertCircle,
  Menu,
  Search,
  ChevronDown,
  Undo2,
  Redo2,
  FileText,
  Factory,
  UserRound,
  Palette,
  Ruler,
  Eye,
  Trash2,
} from "./icons.jsx";
import Scene from "./Scene.jsx";
import ConfiguratorPanel, { MaterialInspector } from "./ConfiguratorPanel.jsx";
import ConfigurationDetails from "./ConfigurationDetails.jsx";
import CostingPage from "./CostingPage.jsx";
import TechnicalPage from "./TechnicalPage.jsx";
import ProjectStorageTools from "./ProjectStorageTools.jsx";
import OrderWorkspace from "./OrderWorkspace.jsx";
import ServerOrders from "./ServerOrders.jsx";
import OperationsPage from "./OperationsPage.jsx";
import { readProfile, validProfile } from "./costing.js";
import {
  initialConfig,
  families,
  fabrics,
  colors,
  getFamily,
  getFabric,
  getColor,
  estimate,
  money,
  validate,
  dimensions,
  csv,
  CATALOG_VERSION,
} from "./domain.js";
import {
  readProjects,
  writeProjects,
  publicLink,
  configFromHash,
  newId,
  projectStorageWarning,
} from "./storage.js";

const steps = [
  {
    id: "composition",
    label: "Композиция",
    hint: "Силуэт и число мест",
    icon: Layers,
  },
  {
    id: "dimensions",
    label: "Размеры",
    hint: "Габариты и посадка",
    icon: Ruler,
  },
  { id: "fabric", label: "Обивка", hint: "Фактура и оттенок", icon: Palette },
  {
    id: "details",
    label: "Детали",
    hint: "Опоры и дополнительные опции",
    icon: SlidersHorizontal,
  },
  {
    id: "room",
    label: "Интерьер",
    hint: "Предмет в пространстве",
    icon: Grid2X2,
  },
  {
    id: "technical",
    label: "Сборка",
    hint: "Состав и комплектность",
    icon: Package,
  },
];
const statusLabels = {
  draft: "Черновик",
  requested: "На проверке",
  approved: "Предложение готово",
  changes: "Нужны уточнения",
};
const statusTone = {
  draft: "muted",
  requested: "amber",
  approved: "green",
  changes: "amber",
};
const discountSnapshot = (e, discount) => {
  const finalPrice = Math.round(e.price * (1 - discount / 100)),
    margin = finalPrice ? ((finalPrice - e.cost) / finalPrice) * 100 : 0;
  return { ...e, finalPrice, margin, requiresApproval: margin < 35 };
};
const date = (v) =>
  new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(
    new Date(v),
  );
function download(name, text, type = "application/json") {
  const a = document.createElement("a"),
    url = URL.createObjectURL(new Blob([text], { type }));
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Mark({ type = "sofa" }) {
  return (
    <svg
      className="furniture-mark"
      viewBox="0 0 300 170"
      fill="none"
      aria-hidden="true"
    >
      {type === "headboard" ? (
        <>
          <rect x="47" y="23" width="206" height="116" rx="24" />
          <path d="M88 28v103m41-103v103m42-103v103m41-103v103M72 139v14m156-14v14" />
        </>
      ) : type === "bed" ? (
        <>
          <rect x="60" y="25" width="180" height="80" rx="18" />
          <path d="M60 90L35 145h230l-25-55M80 40v50m47-50v50m47-50v50m46-50v50M60 145v13m180-13v13" />
          <rect x="58" y="92" width="184" height="35" rx="10" />
        </>
      ) : ["chair", "chairbed"].includes(type) ? (
        <>
          <rect x="90" y="27" width="120" height="75" rx="28" />
          <rect x="84" y="90" width="132" height="40" rx="15" />
          <path d="M84 71h-12v63h25m119-63h12v63h-25M99 133l-5 23m107-23l5 23" />
        </>
      ) : (
        <>
          <rect x="48" y="39" width="204" height="69" rx="22" />
          <rect x="48" y="95" width="204" height="37" rx="12" />
          <path d="M149 45v78M49 78H32v57h33m186-57h17v57h-33M59 134v16m180-16v16" />
        </>
      )}
    </svg>
  );
}
function Empty({ title, description, action, onAction }) {
  return (
    <div className="empty-state">
      <Bookmark size={32} strokeWidth={1} />
      <h3>{title}</h3>
      <p>{description}</p>
      {action && (
        <button className="button dark" onClick={onAction}>
          {action}
          <ArrowUpRight size={18} />
        </button>
      )}
    </div>
  );
}
function Choice({ active, onClick, children, description }) {
  return (
    <button
      className={`choice ${active ? "selected" : ""}`}
      onClick={onClick}
      aria-pressed={active}
    >
      <span>{children}</span>
      {description && <small>{description}</small>}
      {active && <Check size={15} />}
    </button>
  );
}
function Modal({ title, children, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    el.showModal();
    const click = (e) => {
      if (e.target === el) onClose();
    };
    el.addEventListener("click", click);
    return () => el.removeEventListener("click", click);
  }, [onClose]);
  return (
    <dialog ref={ref} className="modal" onCancel={onClose}>
      <div className="modal-top">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="Закрыть" onClick={onClose}>
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function App() {
  const [profile, setProfile] = useState(readProfile);
  function updateProfile(p) {
    if (!validProfile(p)) return;
    try {
      localStorage.setItem("gaber.costing.v2", JSON.stringify(p));
      setProfile(p);
    } catch {
      notify("Не удалось сохранить ставки в браузере");
    }
  }
  const [route, setRoute] = useState(() =>
    location.hash.startsWith("#studio")
      ? "studio"
      : ["operations"].includes(location.hash.slice(1))
        ? "partner"
        : location.hash.slice(1) || "home",
  );
  const [config, setConfig] = useState(
    () => configFromHash() || initialConfig(),
  );
  const [step, setStep] = useState("composition");
  const [history, setHistory] = useState([]),
    [future, setFuture] = useState([]),
    [projects, setProjects] = useState(readProjects);
  const [toast, setToast] = useState(""),
    [modal, setModal] = useState(null),
    [mobileNav, setMobileNav] = useState(false),
    [showDimensions, setShowDimensions] = useState(true),
    [previewQuality, setPreviewQuality] = useState("atelier");
  const [selectedProject, setSelectedProject] = useState(null),
    [discount, setDiscount] = useState(0),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [compareIds, setCompareIds] = useState([]);
  const [factoryTab, setFactoryTab] = useState("requests"),
    [comment, setComment] = useState("");
  const sceneRef = useRef(null),
    toastTimer = useRef(null);
  const family = getFamily(config),
    errors = validate(config),
    calculation = errors.length ? null : estimate(config, 0, profile),
    dim = dimensions(config);
  useEffect(() => {
    const f = () => {
      const requested = location.hash.split("?")[0].slice(1) || "home";
      // #operations is a legacy alias; the canonical operator route is
      // #partner. The partner entry MUST survive hashchange navigation,
      // not only a direct initial page load.
      const next = requested === "operations" ? "partner" : requested;
      setRoute(
        [
          "home",
          "studio",
          "projects",
          "factory",
          "partner",
          "orders",
          "materials",
          "costing",
          "technical",
        ].includes(next)
          ? next
          : "home",
      );
      setMobileNav(false);
      if (next === "studio") {
        const c = configFromHash();
        if (c) setConfig(c);
      }
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  function notify(message) {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4500);
  }
  function go(next) {
    if (route === next) window.scrollTo({ top: 0, behavior: "smooth" });
    else location.hash = next;
  }
  function change(patch) {
    const next = { ...config, ...patch };
    setHistory((h) => [...h.slice(-29), config]);
    setFuture([]);
    setConfig(next);
  }
  function undo() {
    if (!history.length) return;
    setFuture((f) => [config, ...f]);
    setConfig(history.at(-1));
    setHistory((h) => h.slice(0, -1));
  }
  function redo() {
    if (!future.length) return;
    setHistory((h) => [...h, config]);
    setConfig(future[0]);
    setFuture((f) => f.slice(1));
  }
  function start(category = "sofa") {
    setConfig(initialConfig(category));
    setHistory([]);
    setFuture([]);
    setStep("composition");
    go("studio");
  }
  function persist(next) {
    try {
      const saved = writeProjects(next, projects);
      setProjects(saved);
      return true;
    } catch (error) {
      notify(
        error instanceof DOMException
          ? "Не удалось сохранить: хранилище браузера недоступно или заполнено. Экспортируйте проект."
          : error.message,
      );
      return false;
    }
  }
  function save(status = "draft") {
    if (errors.length) return notify(errors[0]);
    const now = new Date().toISOString(),
      id = newId(),
      project = {
        id,
        name: `${family.collection} · вариант ${projects.filter((p) => p.config.category === config.category).length + 1}`,
        config: structuredClone(config),
        estimate: calculation,
        image: sceneRef.current?.snapshot() || null,
        status,
        createdAt: now,
        catalogVersion: CATALOG_VERSION,
        events: [
          {
            date: now,
            label:
              status === "requested"
                ? "Демонстрационная заявка создана"
                : "Вариант сохранён",
          },
        ],
      };
    if (persist([project, ...projects])) {
      notify(
        status === "requested"
          ? "Заявка появилась в демо-кабинете фабрики на этом устройстве"
          : "Вариант сохранён на этом устройстве",
      );
      setModal(null);
    }
  }
  function updateProject(id, patch, label) {
    const next = projects.map((p) =>
      p.id === id
        ? {
            ...p,
            ...patch,
            events: [...p.events, { date: new Date().toISOString(), label }],
          }
        : p,
    );
    if (persist(next)) notify(label);
  }
  async function share() {
    try {
      const url = publicLink(config);
      await navigator.clipboard.writeText(url);
      notify(
        "Ссылка на конфигурацию скопирована. Цены в ней демонстрационные.",
      );
    } catch {
      setModal({ type: "share", url: publicLink(config) });
    }
  }
  function exportProject(p) {
    download(
      `gaber-${p?.id?.slice(0, 8) || "configuration"}.json`,
      JSON.stringify(
        {
          schemaVersion: "1.0",
          mode: "demonstration",
          catalogVersion: CATALOG_VERSION,
          config: p?.config || config,
          estimate: p?.estimate || calculation,
        },
        null,
        2,
      ),
    );
  }
  function bom(p) {
    const e = p.estimate || estimate(p.config);
    download(
      `gaber-bom-${p.id.slice(0, 8)}.csv`,
      csv([
        ["ДЕМОНСТРАЦИОННАЯ КАЛЬКУЛЯЦИЯ — НЕ ПРОИЗВОДСТВЕННЫЙ НОРМАТИВ"],
        [
          "Статья",
          "Количество",
          "Единица",
          "Ставка RUB",
          "Сумма RUB",
          "Основание",
        ],
        ...e.rows.map((r) => [r.name, r.qty, r.unit, r.rate, r.cost, r.source]),
        ["Итого себестоимость", "", "", "", e.cost],
        ["Предварительная цена", "", "", "", e.price],
      ]),
      "text/csv;charset=utf-8",
    );
  }
  const active = projects.find((p) => p.id === selectedProject) || null;
  const requested = projects.filter((p) => p.status !== "draft");
  const visibleProjects = projects.filter(
    (p) =>
      (filter === "all" || p.config.category === filter) &&
      `${p.name} ${getFamily(p.config).name}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const currentStep = steps.findIndex((item) => item.id === step);
  const renderPanel = () => (
    <ConfiguratorPanel
      config={config}
      step={step}
      change={change}
      start={start}
      onTechnical={() => go("technical")}
      onCosting={() => go("costing")}
    />
  );
  return (
    <div className={`app route-${route}`}>
      <header className="header">
        <a href="#home" className="brand" aria-label="Gaber — главная">
          <span className="brand-symbol">g.</span>
          <span>
            GABER<small>МЕБЕЛЬНОЕ АТЕЛЬЕ</small>
          </span>
        </a>
        <nav
          className={mobileNav ? "mobile-open" : ""}
          aria-label="Основная навигация"
        >
          <a href="#home" className={route === "home" ? "active" : ""}>
            Коллекции
          </a>
          <a href="#studio" className={route === "studio" ? "active" : ""}>
            Конструктор
          </a>
          <a
            href="#materials"
            className={route === "materials" ? "active" : ""}
          >
            Материалы
          </a>
          <a href="#partner" className={route === "partner" ? "active" : ""}>
            Партнёр GABER
          </a>
          <a href="#orders" className={route === "orders" ? "active" : ""}>
            Заказы · сервер
          </a>
        </nav>
        <div className="header-actions">
          <button
            className={`nav-icon ${route === "projects" ? "active" : ""}`}
            aria-label="Кабинет клиента"
            onClick={() => go("projects")}
          >
            <Bookmark size={17} />
            <span>Кабинет клиента</span>
            {projects.length > 0 && <b>{projects.length}</b>}
          </button>
          <button
            className={`factory-link ${route === "factory" ? "active" : ""}`}
            aria-label="Кабинет фабрики"
            onClick={() => go("factory")}
          >
            <Factory size={16} />
            <span>Фабрика</span>
          </button>
          <button
            className="menu-toggle icon-button"
            aria-label={mobileNav ? "Закрыть меню" : "Открыть меню"}
            aria-expanded={mobileNav}
            onClick={() => setMobileNav(!mobileNav)}
          >
            <Menu size={21} />
          </button>
        </div>
      </header>
      {projectStorageWarning(projects) && (
        <div className="validation-errors" role="alert">
          {projectStorageWarning(projects)}
        </div>
      )}
      {route === "home" && (
        <main>
          <section className="hero">
            <div className="hero-copy">
              <span className="eyebrow">
                <span className="tiny-line" />
                ЦИФРОВОЕ АТЕЛЬЕ МЯГКОЙ МЕБЕЛИ
              </span>
              <h1>Мебель в ваших пропорциях.</h1>
              <p>
                Настройте форму, посадку и материал. Рассмотрите предмет со всех
                сторон, проверьте состав и сохраните вариант для обсуждения с
                ателье.
              </p>
              <button className="button dark" onClick={() => start("sofa")}>
                Создать свой предмет <ArrowUpRight size={19} />
              </button>
              <div className="hero-note">
                <span className="mini-dot" />
                Вращайте модель. Примеряйте идеи.
              </div>
            </div>
            <div className="hero-stage">
              <span className="hero-index">01 — LINEA</span>
              <Scene config={initialConfig()} hero />
              <div className="hero-stage-bottom">
                <dl className="hero-plate">
                  <div>
                    <dt>Габариты</dt>
                    <dd>
                      {initialConfig().width} × {initialConfig().depth} ×{" "}
                      {initialConfig().height} см
                    </dd>
                  </div>
                  <div>
                    <dt>Обивка</dt>
                    <dd>{getFabric(initialConfig()).name}</dd>
                  </div>
                  <div>
                    <dt>Лист</dt>
                    <dd>Лекало 01</dd>
                  </div>
                </dl>
                <button
                  className="round-button"
                  aria-label="Открыть конструктор Linea"
                  onClick={() => start("sofa")}
                >
                  <ArrowUpRight size={24} />
                </button>
              </div>
            </div>
          </section>
          <section
            className="home-assurance"
            aria-label="Возможности конфигуратора"
          >
            <div>
              <strong>Форма и размеры</strong>
              <span>Пять категорий мебели и настройка посадки</span>
            </div>
            <div>
              <strong>Материал и конструкция</strong>
              <span>Обзор 360°, состав изделия и понятные подсказки</span>
            </div>
            <div>
              <strong>Понятный следующий шаг</strong>
              <span>Сохранение варианта и проверка перед демо-заявкой</span>
            </div>
          </section>
          <section className="collection-section">
            <div className="section-top">
              <div>
                <span className="eyebrow">КАТАЛОГ ФОРМ</span>
                <h2>Выберите основу конструкции</h2>
              </div>
              <p>
                Возьмите готовую форму.
                <br />
                Остальное — ваше решение.
              </p>
            </div>
            <div className="collection-grid">
              {families.map((f, i) => (
                <button
                  className="collection-card"
                  key={f.id}
                  onClick={() => start(f.id)}
                >
                  <div className={`card-object object-${f.id}`}>
                    <span className="collection-num">0{i + 1}</span>
                    <Mark type={f.id} />
                    <span className="card-round">
                      <ArrowUpRight size={20} />
                    </span>
                  </div>
                  <div className="collection-caption">
                    <div>
                      <span>{f.label}</span>
                      <h3>{f.name}</h3>
                    </div>
                    <p>{f.subtitle}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>
          <section className="process-section">
            <div>
              <span className="eyebrow">ОТ ВООБРАЖЕНИЯ К ПРЕДМЕТУ</span>
              <h2>
                Каждая деталь
                <br />
                имеет значение.
              </h2>
            </div>
            <div className="process-grid">
              {[
                [
                  "01",
                  "Соберите форму",
                  "Выберите композицию, размеры и детали.",
                ],
                [
                  "02",
                  "Почувствуйте материал",
                  "Примерьте фактуру и цвет на своей модели.",
                ],
                [
                  "03",
                  "Сохраните идею",
                  "Сравните варианты и подготовьте запрос фабрике.",
                ],
              ].map(([n, h, p]) => (
                <article key={n}>
                  <span>{n}</span>
                  <h3>{h}</h3>
                  <p>{p}</p>
                </article>
              ))}
            </div>
          </section>
        </main>
      )}
      {route === "studio" && (
        <main className="studio">
          <aside className="studio-steps">
            <div className="studio-family">
              <span>{family.label}</span>
              <h2>{family.name}</h2>
            </div>
            <div
              className="studio-progress"
              aria-label={`Шаг ${currentStep + 1} из ${steps.length}`}
            >
              <span>
                Шаг {currentStep + 1} из {steps.length}
              </span>
              <div aria-hidden="true">
                <i
                  style={{
                    width: `${((currentStep + 1) / steps.length) * 100}%`,
                  }}
                />
              </div>
              <p>{steps[currentStep].hint}</p>
            </div>
            <nav className="studio-step-nav" aria-label="Этапы конфигурации">
              {steps.map((s, i) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.id}
                    className={step === s.id ? "active" : ""}
                    aria-current={step === s.id ? "step" : undefined}
                    onClick={() => setStep(s.id)}
                  >
                    <Icon size={19} />
                    <span>{s.label}</span>
                    <small>0{i + 1}</small>
                  </button>
                );
              })}
            </nav>
            <div className="step-bottom">
              <span className="tiny-dot" />
              Изменения можно отменить
            </div>
          </aside>
          <section className="studio-center">
            <div className="studio-top">
              <span className="eyebrow">
                {family.collection} / ВАША КОНФИГУРАЦИЯ
              </span>
              <div className="history-actions">
                <button
                  className="icon-button"
                  title="Отменить"
                  aria-label="Отменить изменение"
                  disabled={!history.length}
                  onClick={undo}
                >
                  <Undo2 size={18} />
                </button>
                <button
                  className="icon-button"
                  title="Повторить"
                  aria-label="Повторить изменение"
                  disabled={!future.length}
                  onClick={redo}
                >
                  <Redo2 size={18} />
                </button>
                <button
                  className="icon-button"
                  title="Поделиться"
                  aria-label="Скопировать ссылку"
                  onClick={share}
                >
                  <Share2 size={18} />
                </button>
              </div>
            </div>
            <div className="studio-canvas">
              <Scene
                ref={sceneRef}
                config={config}
                quality={previewQuality}
                onSelect={(part) => {
                  setStep(
                    part === "legs" || part === "arm" || part === "pillow"
                      ? "details"
                      : "fabric",
                  );
                }}
              />
              {showDimensions && (
                <div className="dimension-line">
                  <span />
                  {dim.width} см
                  <span />
                </div>
              )}
              <div className="scene-help">
                Потяните, чтобы повернуть · нажмите на деталь
              </div>
            </div>
            <div className="viewport-tools">
              <div>
                <button
                  className="tool-button"
                  onClick={() => sceneRef.current?.view("reset")}
                >
                  <RotateCcw size={16} />
                  <span>Ракурс</span>
                </button>
                <button
                  className="tool-button"
                  onClick={() => sceneRef.current?.view("top")}
                >
                  <Grid2X2 size={16} />
                  <span>Сверху</span>
                </button>
                <button
                  className={`tool-button ${showDimensions ? "active" : ""}`}
                  onClick={() => setShowDimensions(!showDimensions)}
                >
                  <Ruler size={16} />
                  <span>Размеры</span>
                </button>
                <button
                  className={`tool-button ${previewQuality === "atelier" ? "active" : ""}`}
                  aria-pressed={previewQuality === "atelier"}
                  title="Качество детализации сцены"
                  onClick={() =>
                    setPreviewQuality((q) =>
                      q === "atelier" ? "draft" : "atelier",
                    )
                  }
                >
                  <Eye size={16} />
                  <span>
                    {previewQuality === "atelier" ? "Детали 3D" : "Быстрый 3D"}
                  </span>
                </button>
                <button
                  className="tool-button"
                  title="Экспорт визуального 3D-эскиза, не производственного CAD"
                  onClick={async () => {
                    try {
                      const glb = await sceneRef.current?.exportPreviewGLB();
                      if (!(glb instanceof ArrayBuffer))
                        throw Error("GLB_EXPORT_FAILED");
                      download(
                        `GABER-${config.category}-concept.glb`,
                        glb,
                        "model/gltf-binary",
                      );
                      notify(
                        "Выгружен 3D-эскиз GLB. Не является производственной CAD-моделью.",
                      );
                    } catch {
                      notify(
                        "Не удалось экспортировать GLB. Попробуйте другой браузер.",
                      );
                    }
                  }}
                >
                  <Download size={16} />
                  <span>3D GLB</span>
                </button>
              </div>
              <div>
                <button
                  className="icon-button"
                  aria-label="Отдалить"
                  onClick={() => sceneRef.current?.zoom(1.12)}
                >
                  <Minus size={18} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Приблизить"
                  onClick={() => sceneRef.current?.zoom(0.88)}
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>
            <div className="studio-specs">
              <span>
                {dim.width} × {dim.depth} × {dim.height} см
              </span>
              <span>
                {getFabric(config).name} / {getColor(config).name}
              </span>
              <span className="tag">Цифровой эскиз</span>
            </div>
          </section>
          <aside className="studio-panel">{renderPanel()}</aside>
          <div className="studio-price">
            <div className="studio-price-main" aria-live="polite">
              <span className="price-label">
                Предварительная стоимость <b>ДЕМО</b>
              </span>
              <strong>
                {calculation ? money(calculation.price) : "Проверьте параметры"}
              </strong>
              <button
                className="text-button"
                onClick={() => setModal({ type: "summary" })}
              >
                Что входит <ChevronRight size={14} />
              </button>
            </div>
            <p>
              Проверьте состав.
              <br />
              Затем сохраните или создайте запрос.
            </p>
            <button
              className="button outline"
              disabled={!!errors.length}
              onClick={() => save()}
            >
              <Bookmark size={17} />
              <span>Сохранить</span>
            </button>
            <button
              className="button dark"
              disabled={!!errors.length}
              onClick={() => setModal({ type: "summary" })}
            >
              Проверить и продолжить <ArrowRight size={18} />
            </button>
          </div>
          {errors.length > 0 && (
            <div className="validation-errors" role="alert">
              {errors.join(". ")}
            </div>
          )}
        </main>
      )}
      {route === "materials" && (
        <main className="page materials-page">
          <div className="page-top">
            <div>
              <span className="eyebrow">МАТЕРИАЛ ОПРЕДЕЛЯЕТ ОЩУЩЕНИЕ</span>
              <h1>Тактильная палитра</h1>
              <p>Восемь фактур. Независимые оттенки для каждой детали.</p>
            </div>
            <button className="button dark" onClick={() => go("studio")}>
              Примерить на модели <ArrowUpRight size={18} />
            </button>
          </div>
          <div className="material-card-grid">
            {fabrics.map((f) => (
              <article className="material-card" key={f.id}>
                <div
                  className={`material-large ${f.texture}`}
                  style={{ "--swatch": getColor(config).hex }}
                >
                  <span>{f.collection}</span>
                </div>
                <div>
                  <span className="eyebrow">ЦИФРОВОЙ ОБРАЗЕЦ</span>
                  <h2>{f.name}</h2>
                  <p>{f.desc}</p>
                  <button
                    className="text-button"
                    onClick={() => {
                      change({ fabric: f.id });
                      setStep("fabric");
                      go("studio");
                    }}
                  >
                    Выбрать материал <ArrowUpRight size={17} />
                  </button>
                </div>
              </article>
            ))}
          </div>
          <div className="palette-row">
            <span>Выберите оттенок</span>
            {colors.map((c) => (
              <button
                key={c.id}
                className={`color-button ${config.color === c.id ? "selected" : ""}`}
                style={{ "--swatch": c.hex }}
                aria-label={c.name}
                onClick={() => change({ color: c.id })}
              />
            ))}
          </div>
          <p className="page-disclaimer">
            Коллекции здесь созданы для демонстрации. Они не являются артикулами
            поставщика. Для заказа потребуется реальная ткань, подтверждение
            цвета по образцу и технологическая проверка.
          </p>
        </main>
      )}
      {route === "projects" && (
        <main className="page projects-page">
          <div className="page-top">
            <div>
              <span className="eyebrow">ВАШЕ ЛИЧНОЕ АТЕЛЬЕ</span>
              <h1>
                Мои проекты<span className="count">{projects.length}</span>
              </h1>
              <p>Сохраняйте идеи. Выбирайте лучшее.</p>
            </div>
            <button className="button dark" onClick={() => start()}>
              Новый предмет <Plus size={18} />
            </button>
          </div>
          <ProjectStorageTools
            projects={projects}
            onSaved={(saved) => {
              setProjects(saved);
              setSelectedProject(null);
              setCompareIds([]);
            }}
            onDownload={download}
          />
          <div className="list-toolbar">
            <div className="filter-tabs">
              {[
                ["all", "Все проекты"],
                ...families.map((f) => [f.id, f.name]),
              ].map(([id, l]) => (
                <button
                  key={id}
                  className={filter === id ? "active" : ""}
                  onClick={() => setFilter(id)}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="search-field">
              <Search size={16} />
              <input
                aria-label="Найти проект"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Найти проект"
              />
            </div>
          </div>
          {!projects.length ? (
            <Empty
              title="Здесь начнётся ваша коллекция"
              description="Соберите первый предмет и сохраните его. Проекты хранятся в браузере на этом устройстве."
              action="Открыть конструктор"
              onAction={() => start()}
            />
          ) : !visibleProjects.length ? (
            <Empty
              title="Ничего не найдено"
              description="Измените фильтр или поисковый запрос."
            />
          ) : (
            <div className="project-grid">
              {visibleProjects.map((p) => (
                <article className="project-card" key={p.id}>
                  <button
                    className="project-preview"
                    onClick={() => {
                      setSelectedProject(p.id);
                      setModal({ type: "project" });
                    }}
                  >
                    {p.image ? (
                      <img
                        src={p.image}
                        alt={`${getFamily(p.config).name}, ${getColor(p.config).name}`}
                      />
                    ) : (
                      <Mark type={p.config.category} />
                    )}
                    <span className={`status ${statusTone[p.status]}`}>
                      {statusLabels[p.status]}
                    </span>
                  </button>
                  <div className="project-card-body">
                    <div className="project-title">
                      <h3>{p.name}</h3>
                      <button
                        className="icon-button"
                        aria-label={`Удалить ${p.name}`}
                        onClick={() => setModal({ type: "delete", id: p.id })}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <p>
                      {p.config.width} см · {getFabric(p.config).name} ·{" "}
                      {getColor(p.config).name}
                    </p>
                    <div className="project-card-bottom">
                      <strong>
                        {money(p.quote?.price ?? p.estimate.price)}
                      </strong>
                      <button
                        className={`text-button ${compareIds.includes(p.id) ? "checked" : ""}`}
                        onClick={() =>
                          setCompareIds((ids) =>
                            ids.includes(p.id)
                              ? ids.filter((x) => x !== p.id)
                              : [...ids.slice(-2), p.id],
                          )
                        }
                      >
                        {compareIds.includes(p.id) ? (
                          <Check size={14} />
                        ) : (
                          <Plus size={14} />
                        )}
                        Сравнить
                      </button>
                    </div>
                    <small>{date(p.createdAt)} · демонстрационный расчёт</small>
                  </div>
                </article>
              ))}
            </div>
          )}
          {compareIds.length >= 2 && (
            <div className="compare-bar">
              <span>Выбрано вариантов: {compareIds.length}</span>
              <button
                className="button dark"
                onClick={() => setModal({ type: "compare" })}
              >
                Сравнить варианты <ArrowRight size={17} />
              </button>
              <button
                className="icon-button"
                aria-label="Снять выбор сравнения"
                onClick={() => setCompareIds([])}
              >
                <X size={18} />
              </button>
            </div>
          )}
          <p className="page-disclaimer">
            Демонстрационный кабинет без регистрации. Проекты и заявки доступны
            только в этом браузере. Не вводите персональные или конфиденциальные
            данные.
          </p>
        </main>
      )}
      {route === "factory" && (
        <main className="page factory-page">
          <div className="page-top">
            <div>
              <span className="eyebrow">GABER / ФАБРИКА</span>
              <h1>Технические задания и производство</h1>
              <p>
                Приём и подтверждение задания от партнёра, проверка конструкции,
                этапы исполнения и контроль качества. Клиентская цена и комиссия
                Габер не показываются фабрике в интерфейсе.
              </p>
            </div>
          </div>
          <p className="page-disclaimer">
            Это локальный стенд. Подтверждение ТЗ не является разрешением на
            реальный запуск производства, а смена кабинетов не является
            авторизацией.
          </p>
        </main>
      )}
      {route === "costing" && (
        <CostingPage
          config={config}
          profile={profile}
          onChange={updateProfile}
        />
      )}
      {route === "technical" && <TechnicalPage config={config} />}
      {route === "partner" && (
        <>
          <OperationsPage projects={projects} />
          <CostingPage
            config={config}
            profile={profile}
            onChange={updateProfile}
          />
        </>
      )}
      {route === "orders" && <ServerOrders config={config} />}
      {["projects", "factory", "partner"].includes(route) && (
        <OrderWorkspace
          key={route + ":" + (selectedProject ?? "")}
          selectedProjectId={selectedProject}
          projects={projects}
          role={
            route === "factory"
              ? "factory"
              : route === "partner"
                ? "partner"
                : "client"
          }
        />
      )}
      <footer className="footer">
        <span>
          GABER<span className="footer-dot">.</span>
        </span>
        <p>Идеи становятся предметами.</p>
        <button
          className="demo-info"
          onClick={() => setModal({ type: "about" })}
        >
          О системе <ArrowUpRight size={13} />
        </button>
      </footer>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          {toast}
          <button aria-label="Закрыть сообщение" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {modal && (
        <Modal
          title={
            modal.type === "summary"
              ? "Ваш предмет"
              : modal.type === "project"
                ? active?.name || "Проект"
                : modal.type === "compare"
                  ? "Сравните свои идеи"
                  : modal.type === "delete"
                    ? "Удалить вариант?"
                    : modal.type === "material"
                      ? "Материал крупным планом"
                      : modal.type === "share"
                        ? "Ссылка на конфигурацию"
                        : "О демонстрационной версии"
          }
          onClose={() => setModal(null)}
        >
          {modal.type === "summary" && (
            <>
              <div className="summary-intro">
                <span className="eyebrow">{family.label}</span>
                <h3>
                  {family.name} {family.collection}
                </h3>
                <p>
                  {getFabric(config).collection} / {getColor(config).name}
                </p>
              </div>
              <dl className="spec-list">
                <div>
                  <dt>Габариты</dt>
                  <dd>
                    {dim.width} × {dim.depth} × {dim.height} см
                  </dd>
                </div>
                <div>
                  <dt>Композиция</dt>
                  <dd>
                    {config.layout === "straight"
                      ? "Прямая"
                      : `Шезлонг ${config.layout === "left" ? "слева" : "справа"}`}
                  </dd>
                </div>
                <div>
                  <dt>Материал</dt>
                  <dd>{getFabric(config).name}</dd>
                </div>
                <div>
                  <dt>Подушки</dt>
                  <dd>{config.pillows} шт.</dd>
                </div>
              </dl>
              <ConfigurationDetails config={config} />
              <div className="summary-price">
                <span>Предварительная цена · демо</span>
                <strong>
                  {calculation
                    ? money(calculation.price)
                    : "Параметры требуют проверки"}
                </strong>
              </div>
              <p className="helper">
                Пример включает изделие, работы и упаковку по демонстрационным
                нормам. Доставка, монтаж и налоги не рассчитаны. Итоговую
                стоимость и конструкцию должна подтвердить фабрика.
              </p>
              <div className="summary-next">
                <h4>Перед следующим шагом</h4>
                <ul>
                  <li>Проверьте габариты, материал и комплектацию выше.</li>
                  <li>
                    Сохраните вариант, чтобы вернуться к нему на этом
                    устройстве.
                  </li>
                  <li>Создайте демо-заявку только после проверки состава.</li>
                </ul>
              </div>
              <div className="technical-actions">
                <button
                  className="text-button"
                  onClick={() => {
                    setModal(null);
                    go("costing");
                  }}
                >
                  Подробная калькуляция ↗
                </button>
                <button
                  className="text-button"
                  onClick={() => {
                    setModal(null);
                    go("technical");
                  }}
                >
                  Схема и комплектность ↗
                </button>
              </div>
              <div className="modal-actions">
                <button
                  className="button outline"
                  disabled={errors.length > 0}
                  onClick={() => save()}
                >
                  Сохранить вариант
                </button>
                <button
                  className="button dark"
                  disabled={errors.length > 0}
                  onClick={() => save("requested")}
                >
                  Создать демо-заявку <ArrowRight size={17} />
                </button>
              </div>
              <p className="micro-note">
                Демо-заявка сохраняется в этом браузере. Сообщение фабрике не
                отправляется.
              </p>
            </>
          )}
          {modal.type === "project" && active && (
            <>
              <div className="modal-project-image">
                {active.image ? (
                  <img src={active.image} alt={active.name} />
                ) : (
                  <Mark type={active.config.category} />
                )}
              </div>
              <span className={`status ${statusTone[active.status]}`}>
                {statusLabels[active.status]}
              </span>
              <dl className="spec-list">
                <div>
                  <dt>Габариты</dt>
                  <dd>
                    {Object.values(dimensions(active.config)).join(" × ")} см
                  </dd>
                </div>
                <div>
                  <dt>Материал</dt>
                  <dd>
                    {getFabric(active.config).name} /{" "}
                    {getColor(active.config).name}
                  </dd>
                </div>
                <div>
                  <dt>Расчёт · демо</dt>
                  <dd>{money(active.quote?.price ?? active.estimate.price)}</dd>
                </div>
              </dl>
              <ConfigurationDetails config={active.config} />
              <div className="event-list">
                {active.events.map((e, i) => (
                  <p key={i}>
                    {e.label}
                    <small>{date(e.date)}</small>
                  </p>
                ))}
              </div>
              <div className="modal-actions">
                <button
                  className="button outline"
                  onClick={() => exportProject(active)}
                >
                  <Download size={16} />
                  JSON
                </button>
                <button
                  className="button dark"
                  onClick={() => {
                    setConfig(structuredClone(active.config));
                    setModal(null);
                    setHistory([]);
                    setFuture([]);
                    go("studio");
                  }}
                >
                  Открыть копию <ArrowUpRight size={17} />
                </button>
              </div>
              {active.status === "draft" && (
                <button
                  className="text-button full"
                  onClick={() => {
                    updateProject(
                      active.id,
                      { status: "requested" },
                      "Демонстрационная заявка создана",
                    );
                    setModal(null);
                  }}
                >
                  Передать в демо-кабинет фабрики <ArrowRight size={16} />
                </button>
              )}
            </>
          )}
          {modal.type === "compare" && (
            <div className="compare-grid">
              {projects
                .filter((p) => compareIds.includes(p.id))
                .map((p) => (
                  <article key={p.id}>
                    {p.image ? (
                      <img src={p.image} alt={p.name} />
                    ) : (
                      <Mark type={p.config.category} />
                    )}
                    <h3>{p.name}</h3>
                    <p>
                      {p.config.width} × {dimensions(p.config).depth} см
                    </p>
                    <p>{getFabric(p.config).name}</p>
                    <p>{getColor(p.config).name}</p>
                    <strong>{money(p.quote?.price ?? p.estimate.price)}</strong>
                    <small>Демонстрационная цена</small>
                  </article>
                ))}
            </div>
          )}
          {modal.type === "delete" && (
            <>
              <p>
                Вариант и его локальная история будут удалены с этого
                устройства.
              </p>
              <div className="modal-actions">
                <button
                  className="button outline"
                  onClick={() => setModal(null)}
                >
                  Оставить
                </button>
                <button
                  className="button dark"
                  onClick={() => {
                    if (persist(projects.filter((p) => p.id !== modal.id))) {
                      setCompareIds((ids) =>
                        ids.filter((id) => id !== modal.id),
                      );
                      setModal(null);
                    }
                  }}
                >
                  Удалить
                </button>
              </div>
            </>
          )}
          {modal.type === "material" && (
            <>
              <MaterialInspector config={config} />
              <div
                className={`material-modal-swatch ${getFabric(config).texture}`}
                style={{ "--swatch": getColor(config).hex }}
              />
              <h3>
                {getFabric(config).collection} / {getColor(config).name}
              </h3>
              <p>{getFabric(config).desc}</p>
              <p>
                Фактура процедурная и создана для прототипа. Состав,
                износостойкость, поставщик, остатки и реальный артикул пока не
                подтверждены.
              </p>
              <p className="helper">
                Экран не гарантирует точное совпадение цвета с физическим
                материалом.
              </p>
            </>
          )}
          {modal.type === "share" && (
            <>
              <p>Ссылка содержит только параметры цифровой конфигурации.</p>
              <textarea
                readOnly
                value={modal.url}
                aria-label="Ссылка для копирования"
                onFocus={(e) => e.currentTarget.select()}
              />
            </>
          )}
          {modal.type === "about" && (
            <>
              <p>
                Первый рабочий прототип GABER: собственные цифровые формы,
                Three.js, выбор материалов и деталей, предварительная
                калькуляция и связанные демо-кабинеты.
              </p>
              <p>
                Все цены, нормы и материалы демонстрационные. Проекты хранятся
                локально. Вход, серверные роли, база заказов и реальные данные
                фабрики ещё не подключены.
              </p>
              <p>
                Демо-переключение кабинетов не защищает данные. Не используйте
                эту версию для реальных заказов или конфиденциальной информации.
              </p>
              <button
                className="button outline"
                onClick={() => exportProject()}
              >
                Экспорт текущей конфигурации <Download size={17} />
              </button>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
export default App;
