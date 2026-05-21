## Whiteboard improvements

The current `WhiteboardCanvas` has several reliability and usability issues. The plan below fixes them while keeping the same visual toolbar layout so it still feels familiar.

### Problems in the current implementation

1. **Loses work on resize.** The canvas is recreated whenever the container size changes (the init effect depends on `canvasSize`), so any drawing disappears when the window resizes or the sidebar toggles.
2. **No persistence.** Reloading the page wipes the board. Nothing is saved per user or shared.
3. **No undo / redo.** No way to recover from a mistake.
4. **No delete / keyboard shortcuts.** Selected objects can't be removed with Delete/Backspace; no Ctrl+Z, Ctrl+C/V, Ctrl+A.
5. **No pan or zoom.** Large drawings are unusable.
6. **No eraser.** Only "Clear all" exists.
7. **Shape tool UX bug.** Clicking Rectangle/Circle/Text/Line sets `activeTool` to that shape and adds one shape, but the tool then stays "stuck" in a non-select, non-draw mode where nothing else works until you click Select.
8. **No image support.** Can't paste or drop images onto the board.
9. **Brush size only visible in draw mode** and there's no stroke width control for shapes.
10. **Download only supports PNG** and uses the on-screen size, not a clean export.

### What I'll build

**Reliability**
- Initialise the Fabric canvas **once** and use `canvas.setDimensions()` on container resize via `ResizeObserver`, preserving all objects.
- Wrap Fabric operations in a small `useWhiteboard` hook so state, history and persistence live in one place.
- Debounced autosave to Supabase (`whiteboard_boards` table, one row per user, JSON of `canvas.toJSON()`); restore on mount.
- Loading + "Saved · just now" status indicator so users know their work is safe.

**Editing**
- Undo / redo stack (cap ~50 steps) wired to toolbar buttons and Ctrl+Z / Ctrl+Shift+Z.
- Delete / Backspace removes the active selection; Ctrl+A selects all; Ctrl+C / Ctrl+V duplicates.
- Eraser tool (object eraser: click to remove; for free-drawn strokes uses Fabric's `EraserBrush`).
- Shape tools no longer leave the canvas in a dead mode — after inserting a shape, tool auto-returns to Select.
- Stroke width slider applies to both brush and newly drawn shapes; fill toggle for shapes.

**Navigation**
- Pan (Space + drag, or middle-mouse) and zoom (wheel + Ctrl, plus +/- buttons and "Fit to screen").
- Zoom percentage displayed in the toolbar.

**Content**
- Paste image from clipboard and drag-and-drop image files onto the canvas.
- Export as PNG or SVG at a fixed export resolution (independent of viewport).

**Visual polish**
- Move toolbar into a single sticky bar using existing shadcn tokens (no raw colour classes), grouped: Tools · Colour · Stroke · Zoom · History · File.
- Keep the existing colour palette and overall layout so users recognise it.

### Technical details

- File: refactor `src/components/WhiteboardCanvas.tsx`; extract `src/hooks/useWhiteboard.ts` for canvas/history/persistence logic; small `WhiteboardToolbar.tsx` for the toolbar.
- Fabric: keep dynamic `import('fabric')` to avoid SSR/init issues; init once with a ref guard.
- Resize: `ResizeObserver` on the container → `canvas.setDimensions({width,height})` + `canvas.renderAll()`. No re-instantiation.
- History: listen to `object:added`, `object:modified`, `object:removed`, `path:created`; push `canvas.toJSON()` snapshots, throttled.
- Persistence:
  - New migration adding `public.whiteboard_boards` ( `user_id uuid pk references auth.users`, `data jsonb`, `updated_at timestamptz` ) with RLS so each user can only read/write their own row.
  - Debounced (1.5s) `upsert` after history changes.
  - On mount, `select` row → `canvas.loadFromJSON()` before enabling autosave.
- Keyboard: a single `useEffect` attaches listeners scoped to when the whiteboard view is active and the canvas isn't in text editing mode.
- Export: render to an offscreen `StaticCanvas` at chosen multiplier so exports aren't tied to viewport size.

### Out of scope (flagging for confirmation)

- **Multi-user realtime collaboration** (cursors, shared board). This is a much bigger build (CRDT or Supabase Realtime broadcast); happy to plan separately if you want it.
- **Per-page whiteboards / multiple boards per user.** Current scope is one personal board per user, matching today's single `/view/whiteboard` route.
- No changes to the rich text editor.

Confirm and I'll implement; let me know if you want realtime collaboration or multiple boards included.