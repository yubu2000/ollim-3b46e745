import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type Project = {
  id: string;
  name: string;
  site_url: string;
  brand_name: string;
  competitors: string[];
  created_at: string;
};

type Ctx = {
  projects: Project[];
  project: Project | null;
  selectProject: (id: string) => void;
  loading: boolean;
  refetch: () => void;
};

const ProjectContext = createContext<Ctx>({
  projects: [],
  project: null,
  selectProject: () => {},
  loading: true,
  refetch: () => {},
});

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["projects", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Project[];
    },
  });

  const projects = useMemo(() => data ?? [], [data]);

  useEffect(() => {
    if (projects.length === 0) return;
    const stored = typeof window !== "undefined" ? localStorage.getItem("geo:project") : null;
    const valid = projects.find((p) => p.id === (selectedId ?? stored));
    setSelectedId(valid ? valid.id : (projects[0]?.id ?? null));
  }, [projects, selectedId]);

  const project = projects.find((p) => p.id === selectedId) ?? projects[0] ?? null;

  return (
    <ProjectContext.Provider
      value={{
        projects,
        project,
        loading: isLoading,
        refetch: () => void refetch(),
        selectProject: (id) => {
          setSelectedId(id);
          if (typeof window !== "undefined") localStorage.setItem("geo:project", id);
        },
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProjects() {
  return useContext(ProjectContext);
}
