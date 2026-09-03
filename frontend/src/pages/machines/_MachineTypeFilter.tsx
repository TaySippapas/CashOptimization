import { COLOR } from "@/utils/colors";

interface Props {
  types: string[];          // available types from data
  selected: string[];       // currently selected (empty = all)
  onChange: (sel: string[]) => void;
}

/** Multi-select chip filter for machine types. Page-private. */
export default function MachineTypeFilter({ types, selected, onChange }: Props) {
  const isAll = selected.length === 0;

  const toggle = (t: string) => {
    if (selected.includes(t)) {
      onChange(selected.filter((s) => s !== t));
    } else {
      onChange([...selected, t]);
    }
  };

  return (
    <div className="chip-filter">
      <button
        className={`chip ${isAll ? "active" : ""}`}
        onClick={() => onChange([])}
      >
        All
      </button>
      {types.map((t) => (
        <button
          key={t}
          className={`chip ${selected.includes(t) ? "active" : ""}`}
          onClick={() => toggle(t)}
          style={selected.includes(t) ? { borderColor: COLOR.accent } : undefined}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
