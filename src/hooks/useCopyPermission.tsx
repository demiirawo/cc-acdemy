import { useEffect } from "react";
import { useUserRole } from "./useUserRole";

/**
 * Text selection is switched off across the academy so course material can't be
 * lifted wholesale. Admins are the exception — they write and maintain the
 * content, so copying between pages is part of the job.
 *
 * Applied as a class on <body> because the block itself is a CSS rule; toggling
 * one class is cheaper and less brittle than trying to override the rule on every
 * element that might hold content.
 */
export function useCopyPermission() {
  const { isAdmin, loading } = useUserRole();

  useEffect(() => {
    // Wait for the role to resolve, otherwise the first render would briefly
    // grant selection to everyone before settling.
    if (loading) return;
    document.body.classList.toggle("allow-copy", isAdmin);
    return () => document.body.classList.remove("allow-copy");
  }, [isAdmin, loading]);
}
