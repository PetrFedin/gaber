import React from "react";

/**
 * Силуэты мебели «Лекало»: фронтальные и боковые чертежи на одной сетке 300×170.
 * Четыре веса линии: контур (1,6), детали (1,05), строчка (0,9 пунктиром) и тонкие вспомогательные (0,6).
 * Рисунки схематичны и нужны для каталога и пустых состояний; это не конструкторская документация.
 */
const STITCH = "2.5 2.5";
const Main = (p) => <g strokeWidth="1.6" {...p} />;
const Fine = (p) => <g strokeWidth="1.05" {...p} />;
const Stitch = (p) => <g strokeWidth="0.9" strokeDasharray={STITCH} {...p} />;
const Hair = (p) => <g strokeWidth="0.6" opacity="0.65" {...p} />;
const Ground = () => (
  <Hair>
    <path d="M16 151H284" strokeDasharray="5 3" />
  </Hair>
);
// Размерная линия с засечками на концах.
const Dim = ({x1, x2, y}) => (
  <Hair>
    <path d={`M${x1} ${y}H${x2}M${x1} ${y - 4}V${y + 4}M${x2} ${y - 4}V${y + 4}`} />
  </Hair>
);
// Лекальная надсечка: маленький треугольник на кромке.
const Notch = ({x, y, up = true}) => (
  <Fine>
    <path d={up ? `M${x - 3} ${y}L${x} ${y - 5}L${x + 3} ${y}` : `M${x - 3} ${y}L${x} ${y + 5}L${x + 3} ${y}`} />
  </Fine>
);
const Leg = ({x, y = 138, h = 13, w = 3}) => (
  <Main>
    <path d={`M${x - w} ${y}L${x - w + 1} ${y + h}H${x + w - 1}L${x + w} ${y}`} />
  </Main>
);
const Button = ({x, y}) => (
  <Fine>
    <circle cx={x} cy={y} r="1.6" />
  </Fine>
);

function Sofa() {
  const cols = [68, 122.67, 177.33, 232];
  return (
    <>
      <Ground />
      <Dim x1={44} x2={256} y={162} />
      {/* спинка и три подушки спинки */}
      <Main>
        <rect x="56" y="42" width="188" height="68" rx="16" />
        {cols.slice(0, 3).map((x, i) => (
          <rect key={i} x={x + 1.5} y="50" width={cols[i + 1] - x - 3} height="52" rx="12" />
        ))}
      </Main>
      <Stitch>
        {cols.slice(0, 3).map((x, i) => (
          <rect key={i} x={x + 6} y="55" width={cols[i + 1] - x - 12} height="42" rx="8" />
        ))}
      </Stitch>
      {cols.slice(0, 3).map((x, i) => (
        <Button key={i} x={(x + cols[i + 1]) / 2} y={76} />
      ))}
      {/* сиденье: подушка с двумя швами */}
      <Main>
        <path d="M70 104h160a6 6 0 0 1 6 6v8a6 6 0 0 1-6 6H70a6 6 0 0 1-6-6v-8a6 6 0 0 1 6-6z" />
        <path d="M122.67 104v20M177.33 104v20" />
      </Main>
      <Stitch>
        <path d="M70 111H230" />
      </Stitch>
      {/* цоколь и ножки */}
      <Main>
        <rect x="50" y="124" width="200" height="14" rx="4" />
      </Main>
      <Fine>
        <path d="M54 131H246" strokeDasharray="1 3" />
      </Fine>
      {[62, 112, 188, 238].map((x) => (
        <Leg key={x} x={x} />
      ))}
      {/* подлокотники */}
      <Main>
        <rect x="42" y="72" width="28" height="64" rx="11" />
        <rect x="230" y="72" width="28" height="64" rx="11" />
      </Main>
      <Stitch>
        <path d="M49 80v48M63 80v48M237 80v48M251 80v48" />
      </Stitch>
      {/* декоративные подушки */}
      <Main>
        <rect x="76" y="68" width="28" height="30" rx="7" transform="rotate(-8 90 83)" />
        <rect x="196" y="70" width="28" height="30" rx="7" transform="rotate(7 210 85)" />
      </Main>
      <Stitch>
        <path d="M82 76l14-2M82 90l14-2" transform="rotate(-8 90 83)" />
        <path d="M202 78l14 0M202 92l14 0" transform="rotate(7 210 85)" />
      </Stitch>
      <Notch x={150} y={42} />
      <Notch x={150} y={138} up={false} />
    </>
  );
}

function Chair() {
  return (
    <>
      <Ground />
      <Dim x1={84} x2={216} y={162} />
      <Main>
        {/* спинка */}
        <path d="M104 112V58a24 24 0 0 1 24-24h44a24 24 0 0 1 24 24v54" />
        {/* подлокотники */}
        <rect x="86" y="78" width="24" height="62" rx="11" />
        <rect x="190" y="78" width="24" height="62" rx="11" />
        {/* сиденье и цоколь */}
        <path d="M110 106h80a6 6 0 0 1 6 6v10a6 6 0 0 1-6 6h-80a6 6 0 0 1-6-6v-10a6 6 0 0 1 6-6z" />
        <rect x="98" y="128" width="104" height="11" rx="4" />
      </Main>
      <Stitch>
        <path d="M114 106V62a15 15 0 0 1 15-15h42a15 15 0 0 1 15 15v44" />
        <path d="M116 113h68" />
        <path d="M93 84v50M103 84v50M197 84v50M207 84v50" />
      </Stitch>
      <Fine>
        <path d="M112 40a18 18 0 0 1 18-6h40" opacity="0.5" />
      </Fine>
      <Button x={150} y={72} />
      <Button x={150} y={86} />
      <Main>
        <rect x="132" y="90" width="38" height="20" rx="8" transform="rotate(-5 151 100)" />
      </Main>
      {/* ножки с наклоном */}
      <Main>
        <path d="M108 139L101 151h6l5-12" />
        <path d="M192 139l7 12h-6l-5-12" />
      </Main>
      <Notch x={150} y={34} />
    </>
  );
}

function ChairBed() {
  return (
    <>
      <Ground />
      <Dim x1={40} x2={262} y={162} />
      {/* кресло, вид сбоку: наклонная спинка, сиденье, подлокотник, основание */}
      <Main>
        <path d="M46 108L56 52Q58 44 66 45L76 47Q83 49 82 57L72 112z" />
        <path d="M50 110h74a6 6 0 0 1 6 6v8H50z" />
        <path d="M54 80h46a10 10 0 0 1 10 10v36H54z" />
        <rect x="44" y="126" width="92" height="10" rx="3" />
      </Main>
      <Stitch>
        <path d="M54 58l-4 42" />
        <path d="M60 52l-3 48" />
        <path d="M58 118h64" />
        <path d="M60 90h38" />
      </Stitch>
      <Button x={72} y={66} />
      <Main>
        <path d="M54 136v11M126 136v11" />
        <circle cx="54" cy="148.5" r="2.4" />
        <circle cx="126" cy="148.5" r="2.4" />
      </Main>
      {/* раскладка: три секции матраса на каркасе */}
      <Fine strokeDasharray="4 2.5">
        <rect x="140" y="116" width="38" height="12" rx="4" />
        <rect x="180" y="116" width="38" height="12" rx="4" />
        <rect x="220" y="116" width="38" height="12" rx="4" />
        <path d="M138 133H262" />
      </Fine>
      <Fine>
        <circle cx="179" cy="133" r="2.4" />
        <circle cx="219" cy="133" r="2.4" />
        <path d="M262 133v14M254 147h16" />
        <path d="M138 133v14" />
      </Fine>
      {/* стрелка разворота */}
      <Fine>
        <path d="M150 98a56 56 0 0 1 86 0" />
        <path d="M230 92l6 6-8 2" />
      </Fine>
      <Notch x={199} y={116} />
    </>
  );
}

function Bed() {
  return (
    <>
      <Ground />
      <Dim x1={44} x2={256} y={162} />
      {/* изголовье с вертикальными каналами */}
      <Main>
        <rect x="54" y="26" width="192" height="74" rx="10" />
      </Main>
      <Stitch>
        <rect x="60" y="32" width="180" height="62" rx="6" />
        {[1, 2, 3, 4, 5].map((i) => (
          <path key={i} d={`M${54 + (192 / 6) * i} 34v58`} />
        ))}
      </Stitch>
      <Fine>
        {[1, 2, 3, 4, 5].map((i) => (
          <path key={i} d={`M${54 + (192 / 6) * i - 3} 38v50M${54 + (192 / 6) * i + 3} 38v50`} opacity="0.45" />
        ))}
      </Fine>
      {/* подушки и край одеяла */}
      <Main>
        <rect x="74" y="80" width="56" height="22" rx="9" transform="rotate(-2 102 91)" />
        <rect x="170" y="80" width="56" height="22" rx="9" transform="rotate(2 198 91)" />
      </Main>
      <Stitch>
        <rect x="80" y="85" width="44" height="12" rx="5" transform="rotate(-2 102 91)" />
        <rect x="176" y="85" width="44" height="12" rx="5" transform="rotate(2 198 91)" />
      </Stitch>
      {/* матрас */}
      <Main>
        <rect x="50" y="100" width="200" height="22" rx="8" />
        <path d="M50 110c40 5 160 5 200 0" />
      </Main>
      <Stitch>
        <path d="M58 117H242" />
      </Stitch>
      {/* основание с подъёмным механизмом и ножки */}
      <Main>
        <rect x="46" y="122" width="208" height="16" rx="4" />
      </Main>
      <Fine>
        <path d="M134 130h32" />
        <path d="M60 130H128M172 130H240" strokeDasharray="1 3" />
      </Fine>
      <Main>
        <rect x="56" y="138" width="9" height="13" rx="2" />
        <rect x="235" y="138" width="9" height="13" rx="2" />
      </Main>
      <Notch x={150} y={26} />
    </>
  );
}

function Headboard() {
  return (
    <>
      <Hair>
        <path d="M30 18V152" />
        <path d="M44 148H256" strokeDasharray="5 3" />
      </Hair>
      <Dim x1={44} x2={256} y={16} />
      <Hair>
        <path d="M270 34V132M266 34h8M266 132h8" />
      </Hair>
      {/* крепёжная планка */}
      <Fine>
        <path d="M64 34V26h172v8" />
        <circle cx="76" cy="30" r="1.6" />
        <circle cx="150" cy="30" r="1.6" />
        <circle cx="224" cy="30" r="1.6" />
      </Fine>
      {/* панель */}
      <Main>
        <rect x="44" y="34" width="212" height="98" rx="14" />
      </Main>
      <Stitch>
        <rect x="52" y="42" width="196" height="82" rx="9" />
        {[1, 2, 3, 4].map((i) => (
          <path key={i} d={`M${44 + (212 / 5) * i} 44v78`} />
        ))}
      </Stitch>
      <Fine>
        {[1, 2, 3, 4].map((i) => (
          <path key={i} d={`M${44 + (212 / 5) * i - 3} 50v66M${44 + (212 / 5) * i + 3} 50v66`} opacity="0.45" />
        ))}
      </Fine>
      {[0, 1, 2, 3, 4].map((i) => (
        <Button key={i} x={44 + (212 / 5) * (i + 0.5)} y={83} />
      ))}
      <Notch x={150} y={132} up={false} />
    </>
  );
}

const MARKS = {sofa: Sofa, chair: Chair, chairbed: ChairBed, bed: Bed, headboard: Headboard};

export default function FurnitureMark({type = "sofa"}) {
  const Drawing = MARKS[type] ?? Sofa;
  return (
    <svg
      className="furniture-mark"
      viewBox="0 0 300 170"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <Drawing />
    </svg>
  );
}
