import { Input } from "@/components/ui/input";

// Convert "10:00 AM" <-> "10:00" for <input type="time">
function to24(v: string | undefined): string {
  if (!v) return "";
  const m = v.match(/^(\d{1,2}):?(\d{0,2})\s*(AM|PM)?$/i);
  if (!m) return "";
  let h = parseInt(m[1] || "0", 10);
  const mm = (m[2] || "00").padStart(2, "0");
  const ap = m[3]?.toUpperCase();
  if (ap === "PM" && h < 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${mm}`;
}

function to12(v: string): string {
  if (!v) return "";
  const [hStr, m] = v.split(":");
  let h = parseInt(hStr, 10);
  const ap = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m} ${ap}`;
}

export function TimePicker({
  value,
  onChange,
  placeholder = "Time",
  className,
}: {
  value: string | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <Input
      type="time"
      className={className}
      value={to24(value)}
      onChange={(e) => onChange(e.target.value ? to12(e.target.value) : "")}
      placeholder={placeholder}
    />
  );
}
