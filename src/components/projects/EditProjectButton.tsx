"use client";

import { useState } from "react";
import { Settings2 } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { ProjectForm, type ProjectFormValues } from "./ProjectForm";

export function EditProjectButton({ projectId, initial }: { projectId: string; initial: ProjectFormValues }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
        <Settings2 className="size-4" /> Project details
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Project details">
        <ProjectForm projectId={projectId} initial={initial} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}
