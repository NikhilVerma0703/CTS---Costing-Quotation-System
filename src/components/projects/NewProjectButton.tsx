"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { ProjectForm } from "./ProjectForm";

export function NewProjectButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> New Project
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="New project">
        <ProjectForm onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}
