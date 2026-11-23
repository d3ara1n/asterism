import { createContext, useContext } from "react";

/** Application navigation from skill settings to recorded usage; absent outside the application shell. */
export interface SkillUsageNavigation { open(skill: { id: string; source: string }): void }
export const SkillUsageContext = createContext<SkillUsageNavigation | null>(null);
export const useSkillUsageNavigation = () => useContext(SkillUsageContext);
