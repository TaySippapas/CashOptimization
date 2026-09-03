import type { MachineInput } from "@/types";
import { generateMachineInputs } from "@/domain/tracking";
import { MACHINES_KEY as STORAGE_KEY } from "./keys";

export function loadMachines(): MachineInput[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return generateMachineInputs();
    const parsed = JSON.parse(raw) as MachineInput[];
    return Array.isArray(parsed) && parsed.length ? parsed : generateMachineInputs();
  } catch {
    return generateMachineInputs();
  }
}

export function saveMachines(machines: MachineInput[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(machines));
  } catch {
    /* ignore quota errors */
  }
}

export function resetMachines(): MachineInput[] {
  localStorage.removeItem(STORAGE_KEY);
  return generateMachineInputs();
}
