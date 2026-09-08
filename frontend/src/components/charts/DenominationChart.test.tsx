import { cloneElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { DenominationGap } from "./DenominationChart";

const state = vi.hoisted(() => ({ hovered: null as { key: "actual" | "plan"; index: number } | null }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useState: () => [state.hovered, vi.fn()] };
});
vi.mock("recharts", () => {
  const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Empty = () => null;
  return {
    ResponsiveContainer: Container, BarChart: Container, PieChart: Container,
    Bar: Empty, Pie: Empty, Cell: Empty, XAxis: Empty, YAxis: Empty, ReferenceLine: Empty, Sector: Empty, Rectangle: Empty,
    // Reproduce the bug: chart payload reports the first (blue) entry even when orange is hovered.
    Tooltip: ({ content }: { content: ReactElement }) => cloneElement(content, {
      active: true, payload: [{ dataKey: "actual", value: 1000000, payload: { name: "฿1000" } }],
    }),
  };
});

const data = { actual_b1000: 1000000, b1000: 250000, actual_b500: 80000, b500: 0 };
beforeEach(() => { state.hovered = null; });

it("shows each stacked segment's own amount, label and color despite a stale tooltip payload", () => {
  state.hovered = { key: "actual", index: 0 };
  const blue = renderToStaticMarkup(<DenominationGap data={data} />);
  expect(blue).toContain("Actual (d-1)");
  expect(blue).toContain("1,000,000");
  expect(blue).toContain("color:var(--accent)");
  state.hovered = { key: "plan", index: 0 };
  const orange = renderToStaticMarkup(<DenominationGap data={data} />);
  expect(orange).toContain("Delivery Plan (d)");
  expect(orange).toContain("250,000");
  expect(orange).toContain("color:var(--amber)");
  expect(orange).not.toContain("1,000,000");
});

it("selects the hovered denomination and preserves a genuine zero amount", () => {
  state.hovered = { key: "plan", index: 1 };
  const html = renderToStaticMarkup(<DenominationGap data={data} />);
  expect(html).toContain("฿500");
  expect(html).toContain("฿0");
  expect(html).not.toContain("250,000");
});

it("clears the tooltip when no segment is hovered", () => {
  expect(renderToStaticMarkup(<DenominationGap data={data} />)).not.toContain("gap-tooltip");
});
