import { useMemo } from "react";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { ExternalLink, Plus, Check, Users } from "lucide-react";
import { UNCATEGORIZED } from "./handoverTasks";
import type { HandoverTemplate } from "./useHandoverTemplates";

interface Props {
  templates: HandoverTemplate[];
  /** Template ids already on this handover's checklist. */
  usedTemplateIds: Set<string>;
  onAdd: (t: HandoverTemplate) => void;
  /**
   * Offered when the leave has two or more required coverers: adds the
   * template to every required handover of the leave that lacks it.
   */
  onAddToAll?: (t: HandoverTemplate) => void;
  /** Template ids every required coverer already has — nothing left to add. */
  usedByAllTemplateIds?: Set<string>;
}

/** The Task Library accordion, scoped to one handover. */
export function HandoverTaskLibrary({ templates, usedTemplateIds, onAdd, onAddToAll, usedByAllTemplateIds }: Props) {
  // Group templates by category for the library accordion
  const groupedTemplates = useMemo(() => {
    const groups = new Map<string, HandoverTemplate[]>();
    for (const t of templates) {
      const cat = (t.category || "").trim() || UNCATEGORIZED;
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(t);
    }
    return Array.from(groups.entries());
  }, [templates]);

  if (groupedTemplates.length === 0) return null;

  return (
    <div className="bg-muted/20 px-4 sm:px-6 py-2 border-b">
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="library" className="border-0">
          <AccordionTrigger className="py-2 hover:no-underline">
            <span className="flex items-center gap-2 text-sm font-semibold">
              Task Library
              <span className="text-xs font-normal text-muted-foreground">
                ({templates.length} tasks · {groupedTemplates.length} categories)
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3 pb-2">
              {groupedTemplates.map(([category, items]) => (
                <div key={`lib-${category}`} className="rounded-lg border bg-background overflow-hidden">
                  <div className="px-3 py-2 bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {category}
                  </div>
                  <div className="divide-y divide-border">
                    {items.map((t) => {
                      const added = usedTemplateIds.has(t.id);
                      const addedEverywhere = !!usedByAllTemplateIds?.has(t.id);
                      return (
                        <div
                          key={t.id}
                          className={`flex items-center justify-between gap-3 px-3 py-2 ${added ? "bg-success/5" : "hover:bg-muted/30"}`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">{t.name}</div>
                            {t.description && (
                              <div className="text-xs text-muted-foreground line-clamp-2">{t.description}</div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {t.link && (
                              <a
                                href={t.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-primary"
                                onClick={(e) => e.stopPropagation()}
                                title="Open link"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                            {added ? (
                              <span className="inline-flex items-center gap-1 text-xs text-success px-2 py-1">
                                <Check className="h-3.5 w-3.5" /> Added
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => onAdd(t)}
                                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:bg-primary/10 rounded px-2 py-1 transition"
                              >
                                <Plus className="h-3.5 w-3.5" /> Add
                              </button>
                            )}
                            {onAddToAll && !addedEverywhere && (
                              <button
                                type="button"
                                onClick={() => onAddToAll(t)}
                                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:bg-primary/10 rounded px-2 py-1 transition"
                                title="Add to every coverer of this leave who doesn't have it yet"
                              >
                                <Users className="h-3.5 w-3.5" /> Add to all coverers
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
