export default function ScenarioAssumptionInput({
  label,
  value,
  onChange,
  suffix,
  signed,
  money,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  signed?: boolean;
  money?: boolean;
}) {
  const display = money ? Math.round(value / 1_000_000) : value;
  return (
    <div className="sc-assume-row">
      <span className="sc-assume-label">{label}</span>
      <span className="sc-assume-value">
        <input
          type="number"
          value={display}
          onChange={(e) => onChange(money ? Number(e.target.value) * 1_000_000 : Number(e.target.value))}
          className="sc-input"
        />
        <span className={`sc-assume-suffix ${signed && value > 0 ? "pos" : signed && value < 0 ? "neg" : ""}`}>
          {money ? "M THB" : suffix}
        </span>
      </span>
    </div>
  );
}
