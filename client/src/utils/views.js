import { BarChart3, BookOpen, Briefcase, CalendarCheck, NotebookPen, Settings } from "lucide-react";

/** The pages of the app, in sidebar order. `key` is the keyboard shortcut. */
export const VIEWS = [
  { id: "today", label: "Today", icon: CalendarCheck, key: "1" },
  { id: "applications", label: "Applications", icon: Briefcase, key: "2" },
  { id: "study", label: "Study", icon: BookOpen, key: "3" },
  { id: "journal", label: "Journal", icon: NotebookPen, key: "4" },
  { id: "insights", label: "Insights", icon: BarChart3, key: "5" },
  { id: "settings", label: "Settings", icon: Settings, key: "6" },
];
