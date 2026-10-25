import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { installListContinuation } from "./lib/listContinue.js";
import { installAutoCap } from "./lib/autoCap.js";
import { installAutoGrow } from "./lib/autoGrow.js";

// Ô ghi chú tự nối danh sách "1. / 2." và "* " khi Enter, như khung chat.
installListContinuation();
// Ô ghi chú tự viết hoa chữ đầu câu / đầu dòng.
installAutoCap();
// Ô ghi chú tự cao theo nội dung (gắn trước render để bắt cả lúc React đổi giá trị ô).
installAutoGrow();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
