import React from 'react';

/**
 * Набор иконок «Стежок» для GABER. Сетка 24, штрих 1,75, прямые торцы и острые углы, как на чертеже лекала.
 * Предметы ателье (диван, кресло, мерная лента, образец ткани, пуговица, лекала, бирка) нарисованы
 * специально; служебные (стрелки, крестик, плюс) тем же штрихом. Интерфейс совместим с lucide-react:
 * <Icon size={20} strokeWidth={1.75} className="..." />.
 */
const make = (name, children) => {
  const Icon = ({size = 20, strokeWidth = 1.75, className = '', ...rest}) => (
    <svg
      className={('stitch-icon ' + className).trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
  Icon.displayName = name;
  return Icon;
};

// ---- предметы ателье ----
export const Layers = make('Sofa', (
  <>
    <path d="M6 11V8.5A1.5 1.5 0 0 1 7.5 7h9A1.5 1.5 0 0 1 18 8.5V11" />
    <path d="M3 12.5a1.5 1.5 0 0 1 3 0V14h12v-1.5a1.5 1.5 0 0 1 3 0V17H3z" />
    <path d="M6 17v2.5M18 17v2.5" />
  </>
));
export const Armchair = make('Armchair', (
  <>
    <path d="M7 11V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v4" />
    <path d="M4 14a2 2 0 0 1 4 0v1h8v-1a2 2 0 0 1 4 0v3H4z" />
    <path d="M6 17v2.5M18 17v2.5" />
  </>
));
export const Ruler = make('Tape', (
  <>
    <path d="M3 8.5h18v7H3z" />
    <path d="M7 8.5v3M11 8.5v2M15 8.5v3M19 8.5v2" />
  </>
));
export const Palette = make('Swatch', (
  <>
    <path d="M7 4h13v16H7z" />
    <path d="M10 7.5h7v9h-7z" strokeDasharray="2 2" />
    <path d="M2.5 8h4.5M2.5 12h4.5M2.5 16h4.5" />
  </>
));
export const SlidersHorizontal = make('Button', (
  <>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <path d="M10.5 10.5h.01M13.5 10.5h.01M10.5 13.5h.01M13.5 13.5h.01" strokeLinecap="round" strokeWidth="2.2" />
  </>
));
export const Grid2X2 = make('Room', (
  <>
    <path d="M4 4h16v16h-7M4 4v16h5" />
    <path d="M9 20a4 4 0 0 1 4-4" />
  </>
));
export const Package = make('Pattern', (
  <>
    <path d="M4 20V6a2 2 0 0 1 2-2h6c0 4 3 6.5 8 6.5V20z" />
    <path d="M9 9v8M9 9l-1.8 2.4M9 9l1.8 2.4" />
    <path d="M4 15h3M15 20v-3" />
  </>
));
export const Bookmark = make('Tag', (
  <>
    <path d="M4 4h7l9 9-7 7-9-9z" />
    <circle cx="8.5" cy="8.5" r="1.4" />
  </>
));
export const Factory = make('Atelier', (
  <>
    <path d="M3 20V10l5 3v-3l5 3v-3l5 3V5h3v15z" />
    <path d="M7 20v-3h4v3" />
  </>
));

// ---- служебные ----
export const ArrowRight = make('ArrowRight', <path d="M4 12h15M14 7l5 5-5 5" />);
export const ArrowUpRight = make('ArrowUpRight', <path d="M7 17L17 7M8 7h9v9" />);
export const Check = make('Check', <path d="M4 12.5l5 5L20 6.5" />);
export const CheckCircle2 = make('CheckCircle', (
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12.5l3 3 5-6" />
  </>
));
export const AlertCircle = make('Alert', (
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5V13M12 16.5v.01" />
  </>
));
export const ChevronDown = make('ChevronDown', <path d="M6 9l6 6 6-6" />);
export const ChevronRight = make('ChevronRight', <path d="M9 6l6 6-6 6" />);
export const Clock = make('Clock', (
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>
));
export const Download = make('Download', <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 20h14" />);
export const Eye = make('Eye', (
  <>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="3" />
  </>
));
export const FileText = make('FileText', (
  <>
    <path d="M6 3h8l4 4v14H6z" />
    <path d="M14 3v4h4M9 12h6M9 16h6" />
  </>
));
export const Maximize2 = make('Maximize', <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />);
export const Menu = make('Menu', <path d="M4 7h16M4 12h16M4 17h16" />);
export const Minus = make('Minus', <path d="M5 12h14" />);
export const Plus = make('Plus', <path d="M5 12h14M12 5v14" />);
export const Move3D = make('Cube', (
  <>
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
    <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
  </>
));
export const Redo2 = make('Redo', <path d="M20 8l-4-4M20 8l-4 4M20 8H10a6 6 0 0 0 0 12h3" />);
export const Undo2 = make('Undo', <path d="M4 8l4-4M4 8l4 4M4 8h10a6 6 0 0 1 0 12h-3" />);
export const RotateCcw = make('Rotate', <path d="M4 12a8 8 0 1 0 2.5-5.8M4 4v4.5h4.5" />);
export const Search = make('Search', (
  <>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5L21 21" />
  </>
));
export const Share2 = make('Share', (
  <>
    <circle cx="6" cy="12" r="2.5" />
    <circle cx="18" cy="6" r="2.5" />
    <circle cx="18" cy="18" r="2.5" />
    <path d="M8.3 10.8l7.4-3.6M8.3 13.2l7.4 3.6" />
  </>
));
export const Trash2 = make('Trash', <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />);
export const UserRound = make('User', (
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
  </>
));
export const X = make('Close', <path d="M5 5l14 14M19 5L5 19" />);

export const Sun = make('Sun', (
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" />
  </>
));
export const Moon = make('Moon', <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z" />);
