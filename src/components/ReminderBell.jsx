// Chuông thông báo trên thanh trên cùng — tách khỏi Reminders.jsx để trang Thông báo (lịch nhắc,
// timeline, phiên nến…) chỉ tải khi mở tới, còn cái chuông luôn có mặt thì nhẹ.
import { useMemo } from "react";
import { Bell, BellRing } from "lucide-react";
import { reminderDueToday, todayStr } from "../lib/helpers.js";

export function ReminderBell({ reminders, onOpen }) {
  const ts = todayStr();
  const dueList = useMemo(() => reminders.filter((r) => reminderDueToday(r, ts)), [reminders, ts]);

  return (
    <button
      type="button"
      className={`bell-btn ${dueList.length ? "bell-btn-active" : ""}`}
      onClick={onOpen}
      title={dueList.length ? `${dueList.length} thông báo cần làm hôm nay` : "Thông báo"}
    >
      {dueList.length ? <BellRing size={17} /> : <Bell size={17} />}
      {dueList.length ? <span className="bell-badge">{dueList.length}</span> : null}
    </button>
  );
}
