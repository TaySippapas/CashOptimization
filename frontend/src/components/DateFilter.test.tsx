import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import DateFilter from "./DateFilter";

const { app } = vi.hoisted(() => ({ app: {
  selectedDate: "", selectedDates: { branches: "", machines: "", routes: "" },
  businessDates: { branches: "2026-09-05", machines: "2026-09-07", routes: "2026-09-09" },
  dataLoading: false, setDatasetDate: vi.fn(), setSelectedDate: vi.fn(),
} }));
vi.mock("@/hooks/useAppData", () => ({ useAppData: () => app }));
vi.mock("./AvailableDatePicker", () => ({ default: ({ value }: { value: string }) => <output>{value}</output> }));

beforeEach(() => { app.selectedDates = { branches: "", machines: "", routes: "" }; });

it("displays each dataset's returned latest date", () => {
  expect(renderToStaticMarkup(<DateFilter dataset="routes" />)).toContain("2026-09-09");
  expect(renderToStaticMarkup(<DateFilter dataset="branches" />)).toContain("2026-09-05");
  expect(renderToStaticMarkup(<DateFilter dataset="machines" />)).toContain("2026-09-07");
});

it("keeps the route selection separate from branches and restores the route latest label", () => {
  app.selectedDates.routes = "2026-09-03";
  expect(renderToStaticMarkup(<DateFilter dataset="routes" />)).toContain("2026-09-03");
  expect(renderToStaticMarkup(<DateFilter dataset="branches" />)).toContain("2026-09-05");
  app.selectedDates.routes = "";
  expect(renderToStaticMarkup(<DateFilter dataset="routes" />)).toContain("2026-09-09");
});
