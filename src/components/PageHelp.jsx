import { useEffect, useState } from "react";
import { HelpCircle, X } from "lucide-react";
import { GLOSSARY, PAGE_HELP } from "../lib/pageHelp.js";
import { readLocalUi, writeLocalUi } from "../lib/helpers.js";

// Nút "Hướng dẫn" ở đầu mỗi trang. Mặc định gập (chỉ một nút nhỏ) để không chiếm chỗ;
// mở / gập nhớ riêng từng trang trên máy này.
export function PageHelp({ view }) {
  const help = PAGE_HELP[view];
  const key = `pageHelp:${view}`;
  const [open, setOpen] = useState(() => readLocalUi(key, "0") === "1");
  useEffect(() => { setOpen(readLocalUi(key, "0") === "1"); }, [key]);
  if (!help) return null;
  const toggle = (v) => { setOpen(v); writeLocalUi(key, v ? "1" : "0"); };
  const terms = (help.terms || []).map((t) => (Array.isArray(t) ? t : GLOSSARY[t])).filter(Boolean);

  if (!open) {
    return (
      <div className="page-help-bar">
        <button type="button" className="page-help-btn" onClick={() => toggle(true)} title="Trang này dùng để làm gì, dùng thế nào">
          <HelpCircle size={14} /> Hướng dẫn
        </button>
      </div>
    );
  }
  return (
    <section className="page-help" aria-label={`Hướng dẫn trang ${help.title}`}>
      <header className="page-help-head">
        <HelpCircle size={16} />
        <b>Hướng dẫn · {help.title}</b>
        <button type="button" className="page-help-close" onClick={() => toggle(false)} aria-label="Đóng hướng dẫn">
          Đã hiểu, ẩn đi <X size={14} />
        </button>
      </header>
      <p className="page-help-what">{help.what}</p>
      <div className="page-help-cols">
        <div className="page-help-col">
          <h4>Cách dùng</h4>
          <ol className="page-help-steps">{help.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
          {help.tabs && help.tabs.length ? (
            <>
              <h4>Các tab trong trang</h4>
              <dl className="page-help-dl">
                {help.tabs.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
              </dl>
            </>
          ) : null}
        </div>
        {terms.length || (help.tips && help.tips.length) ? (
          <div className="page-help-col">
            {terms.length ? (
              <>
                <h4>Giải thích từ khó</h4>
                <dl className="page-help-dl">
                  {terms.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
                </dl>
              </>
            ) : null}
            {help.tips && help.tips.length ? (
              <>
                <h4>Mẹo</h4>
                <ul className="page-help-tips">{help.tips.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
