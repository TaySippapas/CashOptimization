import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  dates: string[];
  value: string;
  onChange: (date: string) => void;
  label?: string;
  disabled?: boolean;
}

export default function AvailableDatePicker({ dates, value, onChange, label = "business date", disabled = false }: Props) {
  const available = useMemo(() => new Set(dates), [dates]);
  const months = useMemo(() => [...new Set(dates.map((date) => date.slice(0, 7)))].sort(), [dates]);
  const [month, setMonth] = useState(value.slice(0, 7));
  const visibleMonth = months.includes(month) ? month : months[months.length - 1];
  const monthIndex = months.indexOf(visibleMonth);
  const picker = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);

  useEffect(() => { setMonth(value.slice(0, 7)); }, [value]);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (picker.current && !picker.current.contains(event.target as Node)) picker.current.open = false;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && picker.current?.open) {
        picker.current.open = false;
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  if (disabled || !visibleMonth) return <button type="button" className="date-picker-trigger" disabled>{disabled ? "Loading dates…" : "No available dates"}</button>;
  const [year, monthNumber] = visibleMonth.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const dayCount = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();

  return (
    <details className="available-date-picker" ref={picker}>
      <summary ref={trigger} className="date-picker-trigger" aria-label={`Choose ${label}, selected ${value || "none"}`}>
        <Calendar size={15} aria-hidden="true" /> {value || "Select date"}
      </summary>
      <div className="date-calendar" role="group" aria-label={`Available ${label}s`}>
        <div className="date-calendar-nav">
          <button type="button" aria-label="Previous available month" disabled={monthIndex <= 0}
            onClick={() => setMonth(months[monthIndex - 1])}><ChevronLeft size={16} /></button>
          <select aria-label="Calendar month" value={visibleMonth} onChange={(event) => setMonth(event.target.value)}>
            {months.map((item) => <option key={item} value={item}>{new Date(`${item}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}</option>)}
          </select>
          <button type="button" aria-label="Next available month" disabled={monthIndex >= months.length - 1}
            onClick={() => setMonth(months[monthIndex + 1])}><ChevronRight size={16} /></button>
        </div>
        <div className="date-calendar-grid">
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => <span key={day} className="date-calendar-weekday" aria-hidden="true">{day}</span>)}
          {Array.from({ length: firstWeekday }, (_, i) => <span key={`blank-${i}`} />)}
          {Array.from({ length: dayCount }, (_, i) => {
            const date = `${visibleMonth}-${String(i + 1).padStart(2, "0")}`;
            const enabled = available.has(date);
            return <button key={date} type="button" disabled={!enabled} aria-label={date}
              aria-pressed={date === value} title={enabled ? date : "No data for this date"}
              onClick={() => {
                if (!enabled) return;
                onChange(date);
                if (picker.current) picker.current.open = false;
                trigger.current?.focus();
              }}>{i + 1}</button>;
          })}
        </div>
        <p className="date-calendar-hint">Greyed-out dates have no data.</p>
      </div>
    </details>
  );
}
