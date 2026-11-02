import React from "react";
import ReactDOM from "react-dom/client";
import { Button } from "@jerico/ui/button";
import "./style.css";

function App() {
  return (
    <main className="desktop-shell">
      <header className="desktop-header">
        <div className="brand"><span className="brand-mark">J</span><span>jerico</span></div>
        <span className="platform-label">Desktop preview</span>
      </header>
      <section className="desktop-content">
        <p className="eyebrow">OBSERVABILITY, CLOSE AT HAND</p>
        <h1>Your products.<br />In view.</h1>
        <p className="intro">The Jerico desktop client will bring project visibility, incident notifications, and quick access to your observability workspace.</p>
        <div className="desktop-panel"><span className="status-dot" /><div><strong>Desktop foundation ready</strong><p>This shell is connected to the shared Jerico UI package.</p></div></div>
        <Button href="https://github.com/richard-mante/jerico" target="_blank" rel="noreferrer">View project on GitHub</Button>
      </section>
      <footer>Jerico desktop · Early development</footer>
    </main>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("The Jerico desktop root element is missing.");
}

ReactDOM.createRoot(rootElement).render(<React.StrictMode><App /></React.StrictMode>);
