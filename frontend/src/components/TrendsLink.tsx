import { ArrowUpRight, ChartNoAxesCombined } from "lucide-react";
import { Link } from "react-router-dom";
import type { TrackingDataset } from "@/api/backend";
import { useAppData } from "@/hooks/useAppData";

export default function TrendsLink({ dataset }: { dataset: TrackingDataset }) {
  const { selectedDates } = useAppData();
  const end = selectedDates[dataset];
  return <Link className="trends-link" to={`/${dataset}/trends${end ? `?end=${encodeURIComponent(end)}` : ""}`}>
    <ChartNoAxesCombined size={16} /> View Trends <ArrowUpRight size={15} />
  </Link>;
}
