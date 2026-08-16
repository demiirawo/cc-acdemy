/**
 * Draws the Essential Reading process maps.
 *
 * Every map here is built from the wording already published in its own
 * article — the boxes are the steps that article lists, and a branch only
 * appears where the article states one. Nothing is invented.
 *
 * The same drawing code the editor uses renders these, so a map generated
 * here and a map drawn in the app are the same thing and stay editable.
 *
 *   node scripts/run-process-maps.mjs --preview   → an HTML page to look at
 *   node scripts/run-process-maps.mjs --sql       → UPDATE statements
 */
import {
  autoLayout,
  makeEdge,
  measureNode,
  renderProcessMapSvg,
  serialiseProcessMap,
  type MapColour,
  type MapEdge,
  type MapNode,
  type MapShape,
  type ProcessMapModel,
} from "../src/lib/processMap";

type NodeSpec = [id: string, text: string, shape?: MapShape, colour?: MapColour];
type EdgeSpec = [from: string, to: string, label?: string, opts?: Partial<MapEdge>];

function build(title: string, nodes: NodeSpec[], edges: EdgeSpec[]): ProcessMapModel {
  const built: MapNode[] = nodes.map(([id, text, shape = "process", colour]) => ({
    id,
    text,
    shape,
    colour: colour ?? (shape === "decision" ? "purple" : shape === "document" ? "amber" : "green"),
    x: 0,
    y: 0,
    ...measureNode(text, shape),
  }));

  const built_edges: MapEdge[] = edges.map(([from, to, label, opts]) => ({
    ...makeEdge(from, to, label),
    id: `e_${from}_${to}`,
    ...opts,
  }));

  return autoLayout({ v: 1, title, nodes: built, edges: built_edges });
}

export interface MapInsertion {
  pageId: string;
  page: string;
  /** The heading the diagram is placed directly beneath. */
  heading: string;
  model: ProcessMapModel;
}

export const MAPS: MapInsertion[] = [
  /* ----------------------------------------------------------------- */
  {
    pageId: "a142a718-d706-4440-8ded-87c6b92a841a",
    page: "Incidents, Accidents and Safeguarding",
    heading: "Process Map: Responding to an Incident, Accident or Safeguarding Concern",
    model: build(
      "Responding to an incident, accident or safeguarding concern",
      [
        ["a", "Incident occurs", "terminator", "blue"],
        ["b", "Staff report the incident to the manager or office"],
        ["c", "Log it in the Incident, Accident and Safeguarding Log", "document"],
        ["d", "Manager carries out an initial assessment"],
        ["e", "Is a notification required?", "decision"],
        ["f", "Inform the CQC, local authority and family as appropriate"],
        ["g", "Begin internal investigation"],
        ["h", "Collect statements and evidence from service users and staff"],
        ["i", "Identify root cause and learning"],
        ["j", "Document the investigation and findings in the incident report"],
        ["k", "Inform the CQC, local authority and family of the outcome as appropriate"],
        ["l", "Implement preventative actions"],
        ["m", "Document and share lessons learned", "terminator", "blue"],
      ],
      [
        ["a", "b"],
        ["b", "c"],
        ["c", "d"],
        ["d", "e"],
        ["e", "f", "Yes"],
        ["e", "g", "No"],
        ["f", "g"],
        ["g", "h"],
        ["h", "i"],
        ["i", "j"],
        ["j", "k"],
        ["k", "l"],
        ["l", "m"],
        ["j", "c", "Record it", { colour: "red", dashed: true }],
      ],
    ),
  },

  /* ----------------------------------------------------------------- */
  {
    pageId: "8cc8f556-fb6e-46e5-9f61-a380c4b21a80",
    page: "Medication Management",
    heading: "Process Map: Administering Medication — the Six Rights",
    model: build(
      "Administering medication — the six rights",
      [
        ["a", "Right person", "terminator", "blue"],
        ["b", "Right medication"],
        ["c", "Right dose"],
        ["d", "Right time"],
        ["e", "Right route"],
        ["f", "Was the medication taken?", "decision"],
        ["g", "Record the administration on the E-MAR", "document"],
        ["h", "Report the refusal or missed dose to senior staff or a healthcare professional", "process", "red"],
      ],
      [
        ["a", "b"],
        ["b", "c"],
        ["c", "d"],
        ["d", "e"],
        ["e", "f"],
        ["f", "g", "Yes"],
        ["f", "h", "No"],
        ["h", "g"],
      ],
    ),
  },

  /* ----------------------------------------------------------------- */
  {
    pageId: "6d68fbf5-2de3-4c50-b83d-144b4c097afc",
    page: "Care & Support Notes",
    heading: "Process Map: Writing a Good Care Note",
    model: build(
      "Writing a good care note",
      [
        ["a", "Write at the time of care", "terminator", "blue"],
        ["b", "Describe the support given and how the person responded"],
        ["c", "Make it specific to that person on that day"],
        ["d", "Check the note against the care plan and risk assessments"],
        ["e", "Has anything changed?", "decision"],
        ["f", "Record the change and inform the senior on duty", "process", "amber"],
        ["g", "Store the note securely and confidentially", "terminator", "blue"],
      ],
      [
        ["a", "b"],
        ["b", "c"],
        ["c", "d"],
        ["d", "e"],
        ["e", "f", "Yes"],
        ["e", "g", "No"],
        ["f", "g"],
      ],
    ),
  },

  /* ----------------------------------------------------------------- */
  {
    pageId: "332c906e-452c-4545-8a38-2ad6aab43855",
    page: "Audits",
    heading: "Process Map: The Audit Cycle",
    model: build(
      "The audit cycle",
      [
        ["a", "Plan the audit — scheduled or unannounced", "terminator", "blue"],
        ["b", "Gather the evidence: documents, observation, conversations"],
        ["c", "Assess the areas in scope for that audit type"],
        ["d", "Analyse the findings and report with recommendations"],
        ["e", "Agree an action plan"],
        ["f", "Re-audit to track progress", "process", "blue"],
      ],
      [
        ["a", "b"],
        ["b", "c"],
        ["c", "d"],
        ["d", "e"],
        ["e", "f"],
        ["f", "b", "Re-audit"],
      ],
    ),
  },

  /* ----------------------------------------------------------------- */
  {
    pageId: "ff0c9efe-fbe0-4a5a-9ac1-e02194eae3db",
    page: "Feedback",
    heading: "Process Map: Handling Informal Feedback",
    model: build(
      "Handling informal feedback",
      [
        ["a", "Concern raised", "terminator", "blue"],
        ["b", "Acknowledge it — listen, thank them, show empathy"],
        ["c", "Try to resolve it the same day or by the next working day"],
        ["d", "Resolved, and not serious?", "decision"],
        ["e", "Document it on the feedback form", "document"],
        ["f", "Upload to Airtable with a summary of the action taken", "document"],
        ["g", "Escalate into the formal complaint process", "process", "red"],
      ],
      [
        ["a", "b"],
        ["b", "c"],
        ["c", "d"],
        ["d", "e", "Yes"],
        ["d", "g", "No"],
        ["e", "f"],
      ],
    ),
  },
  {
    pageId: "ff0c9efe-fbe0-4a5a-9ac1-e02194eae3db",
    page: "Feedback",
    heading: "Process Map: Handling a Formal Complaint",
    model: build(
      "Handling a formal complaint",
      [
        ["a", "Complaint received", "terminator", "blue"],
        ["b", "Document the complaint on the feedback form", "document"],
        ["c", "Send an acknowledgement letter within 3 working days", "process", "amber"],
        ["d", "Investigate: gather evidence, speak to staff, review records"],
        ["e", "Do other professionals need to be involved?", "decision"],
        ["f", "Contact safeguarding, social workers or other agencies and document it"],
        ["g", "Send an outcome letter: findings, upheld or not, actions, apology where appropriate"],
        ["h", "Store all supporting evidence on Airtable", "document"],
      ],
      [
        ["a", "b"],
        ["b", "c"],
        ["c", "d"],
        ["d", "e"],
        ["e", "f", "Yes"],
        ["e", "g", "No"],
        ["f", "g"],
        ["g", "h"],
      ],
    ),
  },

  /* ----------------------------------------------------------------- */
  {
    pageId: "8c3960f2-8867-4583-aee7-862df6b6608b",
    page: "Care Plans & Risk Assessment",
    heading: "Process Map: The Care Planning Process",
    model: build(
      "The care planning process",
      [
        ["a", "Initial assessment — getting to know the person", "terminator", "blue"],
        ["b", "Risk assessment — looking out for safety"],
        ["c", "Create the care plan and risk assessment", "document"],
        ["d", "Involve the person, their family and professionals"],
        ["e", "Implement the plan"],
        ["f", "Monitor and adjust"],
        ["g", "Review with the care team, service user and family"],
        ["h", "Track outcomes against the person's goals"],
      ],
      [
        ["a", "b"],
        ["b", "c"],
        ["c", "d"],
        ["d", "e"],
        ["e", "f"],
        ["f", "g"],
        ["g", "h"],
        ["g", "c", "Needs changing"],
      ],
    ),
  },

  /* ----------------------------------------------------------------- */
  {
    pageId: "cc4a1ba0-9268-454a-8d2f-dc5ea9914df2",
    page: "Vehicles & Drivers",
    heading: "Process Map: Clearing a Driver to Drive on Agency Business",
    model: build(
      "Clearing a driver to drive on agency business",
      [
        ["a", "Check the driving licence is valid", "terminator", "blue"],
        ["b", "Run the DVLA check using the share code"],
        ["c", "Take a medical fitness declaration"],
        ["d", "Record all checks on the staff file", "document"],
        ["e", "Cleared to drive on agency business", "terminator", "blue"],
        ["f", "Points, an incident, or a notifiable medical condition?", "decision"],
        ["g", "Tell the Registered Manager immediately", "process", "red"],
      ],
      [
        ["a", "b"],
        ["b", "c"],
        ["c", "d"],
        ["d", "e"],
        ["e", "f"],
        ["f", "g", "Yes"],
        ["g", "b", "Re-check"],
        ["e", "b", "Every 6 months"],
      ],
    ),
  },
  {
    pageId: "cc4a1ba0-9268-454a-8d2f-dc5ea9914df2",
    page: "Vehicles & Drivers",
    heading: "Process Map: Keeping a Vehicle Compliant",
    model: build(
      "Keeping a vehicle compliant",
      [
        ["a", "Vehicle used on agency business", "terminator", "blue"],
        ["b", "MOT — annually, once over 3 years old"],
        ["c", "Vehicle tax — monthly, 6-monthly or annually"],
        ["d", "Business insurance — annually"],
        ["e", "Service — manufacturer's schedule"],
        ["f", "Visual spot check — every 6 months"],
        ["g", "Log it in the Vehicle Log", "document"],
      ],
      [
        ["a", "b"],
        ["a", "c"],
        ["a", "d"],
        ["a", "e"],
        ["a", "f"],
        ["f", "g"],
      ],
    ),
  },

  /* ----------------------------------------------------------------- */
  {
    pageId: "3acdc50c-df8a-49e7-bc45-156e12c9f99b",
    page: "Mental Capacity Act 2005",
    heading: "Process Map: Writing an MCA-Compliant Care Plan",
    model: build(
      "Writing an MCA-compliant care plan",
      [
        ["a", "Record the capacity assessment for that specific decision", "terminator", "blue"],
        ["b", "Record how the person is supported to decide"],
        ["c", "Record any Lasting Power of Attorney and what it covers"],
        ["d", "Record advance statements and advance decisions — or that there are none"],
        ["e", "Plan for fluctuating capacity"],
        ["f", "Document least restrictive practice"],
        ["g", "Record advocacy — including where an IMCA is required"],
      ],
      [
        ["a", "b"],
        ["b", "c"],
        ["c", "d"],
        ["d", "e"],
        ["e", "f"],
        ["f", "g"],
      ],
    ),
  },

  /* ----------------------------------------------------------------- */
  {
    pageId: "3300d97a-e495-4042-81ef-b61e57e6a5a1",
    page: "Staff Meeting",
    heading: "Process Map: Running a Staff Meeting",
    model: build(
      "Running a staff meeting",
      [
        ["a", "Review recent performance", "terminator", "blue"],
        ["b", "Cover compliance and regulation"],
        ["c", "Training and development"],
        ["d", "Review incidents and safeguarding"],
        ["e", "Communication and care planning"],
        ["f", "Document the outcomes and share them with all carers", "document"],
      ],
      [
        ["a", "b"],
        ["b", "c"],
        ["c", "d"],
        ["d", "e"],
        ["e", "f"],
      ],
    ),
  },
];

/* ------------------------------------------------------------------ output */

export function previewHtml(): string {
  const cards = MAPS.map(
    (m) => `
      <section>
        <h2>${m.page}</h2>
        <h3>${m.heading}</h3>
        <div class="frame">${renderProcessMapSvg(m.model)}</div>
      </section>`,
  ).join("");

  return `<!doctype html><meta charset="utf-8"><title>Process map preview</title>
  <style>
    body{font:14px/1.5 system-ui,sans-serif;background:#f6f7f9;margin:0;padding:32px;color:#111}
    section{background:#fff;border:1px solid #e3e6ea;border-radius:10px;padding:20px;margin:0 auto 26px;max-width:1000px}
    h2{margin:0 0 2px;font-size:15px;color:#6b7280;font-weight:600}
    h3{margin:0 0 16px;font-size:19px}
    .frame{overflow-x:auto;border-top:1px solid #eef0f3;padding-top:16px}
  </style>${cards}`;
}

export function sqlStatements(): string {
  return MAPS.map((m) => {
    const heading = m.heading.replace(/'/g, "''");
    const block = serialiseProcessMap(m.model);
    // Slot the drawing in directly beneath its heading, leaving the written
    // explanations that already follow it untouched.
    return `update public.pages set content = replace(content, '<h2>${heading}</h2>', '<h2>${heading}</h2>' || $map$${block}$map$), updated_at = now() where id = '${m.pageId}';`;
  }).join("\n\n");
}
