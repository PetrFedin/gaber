import React from "react";

/**
 * Граница ошибок: сбой одного раздела не должен оставлять пустой экран. Данные в хранилище не трогаются.
 */
export default class ErrorBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    console.error("GABER UI error:", error);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="page error-boundary" role="alert">
        <h1>Раздел не открылся</h1>
        <p>
          Что-то пошло не так при показе страницы. Ваши проекты и черновик не затронуты.
        </p>
        <button className="button dark" onClick={() => location.reload()}>
          Обновить страницу
        </button>{" "}
        <a className="button outline" href="#home">
          На главную
        </a>
      </main>
    );
  }
}
