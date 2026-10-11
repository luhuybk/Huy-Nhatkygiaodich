import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { installListContinuation } from "./lib/listContinue.js";

// Ô ghi chú tự nối danh sách "1. / 2." và "* " khi Enter, như khung chat.
installListContinuation();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
