import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { ResourceListEditor } from "./Resources.jsx";

export function PrinciplesSection({ principles, onChange }) {
  const [tab, setTab] = useState("follow");
  const list = principles[tab] || [];

  return (
    <div>
      <p className="field-hint" style={{ marginBottom: 12 }}>Nguyên tắc giao dịch của riêng bạn — bấm vào slogan ở đầu trang để quay lại đây bất cứ lúc nào.</p>
      <div className="subtabs">
        <button className={`subtab ${tab === "follow" ? "subtab-active" : ""}`} onClick={() => setTab("follow")}>
          <CheckCircle2 size={13} style={{ marginRight: 5, verticalAlign: -2 }} />Tuân thủ
        </button>
        <button className={`subtab ${tab === "avoid" ? "subtab-active" : ""}`} onClick={() => setTab("avoid")}>
          <XCircle size={13} style={{ marginRight: 5, verticalAlign: -2 }} />Cần tránh
        </button>
      </div>
      <div className={`principles-editor ${tab === "follow" ? "principles-editor-follow" : "principles-editor-avoid"}`}>
        <ResourceListEditor
          list={list}
          hint={tab === "follow" ? "Những điều luôn phải tuân thủ khi giao dịch, VD: Không risk quá cao, Đúng setup mới vào lệnh..." : "Những điều cần tránh tuyệt đối, VD: Không FOMO, Không gồng lỗ..."}
          placeholder={tab === "follow" ? "Thêm nguyên tắc cần tuân thủ..." : "Thêm điều cần tránh..."}
          onAdd={(v) => onChange({ ...principles, [tab]: [...(principles[tab] || []), v] })}
          onRemove={(item) => onChange({ ...principles, [tab]: (principles[tab] || []).filter((x) => x !== item) })}
          onSetList={(next) => onChange({ ...principles, [tab]: next })}
        />
      </div>
    </div>
  );
}
