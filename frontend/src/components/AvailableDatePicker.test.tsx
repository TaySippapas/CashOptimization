import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ReportDatePicker from "./AvailableDatePicker";

describe("report calendar availability", () => {
  it("disables missing dates inside the available range as well as outside it", () => {
    const html = renderToStaticMarkup(<ReportDatePicker dates={["2026-09-01", "2026-09-04"]} value="2026-09-04" onChange={() => {}} />);
    const button = (date: string) => html.match(new RegExp(`<button[^>]*aria-label="${date}"[^>]*>`))?.[0];
    expect(button("2026-09-01")).not.toContain("disabled");
    expect(button("2026-09-04")).toContain('aria-pressed="true"');
    expect(button("2026-09-02")).toContain("disabled");
    expect(button("2026-09-30")).toContain("disabled");
  });

  it("renders leap day without spilling into the next month", () => {
    const html = renderToStaticMarkup(<ReportDatePicker dates={["2024-02-29"]} value="2024-02-29" onChange={() => {}} />);
    expect(html).toContain('aria-label="2024-02-29"');
    expect(html).not.toContain('aria-label="2024-02-30"');
  });

  it("offers no selectable date when availability is empty", () => {
    const html = renderToStaticMarkup(<ReportDatePicker dates={[]} value="" onChange={() => {}} />);
    expect(html).toContain("disabled");
    expect(html).toContain("No available dates");
  });
});
