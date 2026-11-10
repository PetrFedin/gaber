import React from "react";
import * as icons from "./icons.jsx";
import FurnitureMark from "./FurnitureMarks.jsx";

// Страница для разработки (#kit, только в dev-сборке): иконки и силуэты крупно для проверки глазами.
export default function DesignKit() {
  return (
    <main className="page design-kit">
      <h1>Набор «Лекало»</h1>
      <h2>Иконки «Стежок»</h2>
      <div className="kit-grid">
        {Object.entries(icons).map(([name, Icon]) => (
          <figure key={name}>
            <Icon size={72} strokeWidth={1.75} />
            <figcaption>
              {name} <Icon size={20} />
            </figcaption>
          </figure>
        ))}
      </div>
      <h2>Силуэты</h2>
      <div className="kit-marks">
        {["sofa", "chair", "chairbed", "bed", "headboard"].map((t) => (
          <figure key={t}>
            <FurnitureMark type={t} />
            <figcaption>{t}</figcaption>
          </figure>
        ))}
      </div>
    </main>
  );
}
