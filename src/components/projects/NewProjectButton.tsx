"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { ProjectForm } from "./ProjectForm";

export function NewProjectButton({ copyOptions }: { copyOptions: { id: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> New project
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="New project">
        <ProjectForm copyOptions={copyOptions} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}
