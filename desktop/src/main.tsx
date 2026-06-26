import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Restore saved accent color before first paint so there's no flash
const savedAccent = localStorage.getItem("accent_color");
if (savedAccent) {
    document.documentElement.style.setProperty("--color-accent", savedAccent);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
        <App/>
    </React.StrictMode>
);
