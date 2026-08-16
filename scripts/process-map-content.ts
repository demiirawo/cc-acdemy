/**
 * Draws the Essential Reading process maps.
 *
 * Every map here is built from the wording already published in its own
 * article — the boxes are the steps that article lists, the explanation
 * against each box is that article's own description of it, and a branch only
 * appears where the article states one. Nothing is invented.
 *
 * The same drawing code the editor uses renders these, so a map generated here
 * and a map drawn in the app are the same thing and stay editable.
 *
 *   node <bundle> --preview   → an HTML page to look at
 *   node <bundle> --sql       → UPDATE statements
 */
import {
  autoLayout,
  makeEdge,
  measureNode,
  renderProcessMapBlock,
  serialiseProcessMap,
  type MapColour,
  type MapEdge,
  type MapNode,
  type MapShape,
  type ProcessMapModel,
} from "../src/lib/processMap";

type NodeSpec = [id: string, text: string, note: string, shape?: MapShape, colour?: MapColour];
type EdgeSpec = [from: string, to: string, label?: string, opts?: Partial<MapEdge>];

function build(title: string, nodes: NodeSpec[], edges: EdgeSpec[]): ProcessMapModel {
  const built: MapNode[] = nodes.map(([id, text, note, shape = "process", colour]) => ({
    id,
    text,
    note,
    shape,
    colour: colour ?? (shape === "decision" ? "purple" : shape === "document" ? "amber" : "green"),
    x: 0,
    y: 0,
    ...measureNode(text, shape),
  }));

  const builtEdges: MapEdge[] = edges.map(([from, to, label, opts]) => ({
    ...makeEdge(from, to, label),
    id: `e_${from}_${to}`,
    ...opts,
  }));

  return autoLayout({ v: 1, title, nodes: built, edges: builtEdges });
}

export interface MapInsertion {
  pageId: string;
  page: string;
  heading: string;
  model: ProcessMapModel;
}

export const MAPS: MapInsertion[] = [
  /* ------------------------------------------------------------------- */
  {
    pageId: "a142a718-d706-4440-8ded-87c6b92a841a",
    page: "Incidents, Accidents and Safeguarding",
    heading: "Process Map: Responding to an Incident, Accident or Safeguarding Concern",
    model: build(
      "Responding to an incident, accident or safeguarding concern",
      [
        ["a", "Incident occurs", "Any event that could harm a service user or place them at risk — an incident, an accident, or a safeguarding concern.", "terminator", "blue"],
        ["b", "Staff report the incident to the manager or office", "Whoever witnesses or discovers the event reports it to the manager or the office."],
        ["c", "Log it in the Incident, Accident and Safeguarding Log", "Follow the recording procedure and log the event in the Incident, Accident and Safeguarding Log.", "document"],
        ["d", "Manager carries out an initial assessment", "The manager reviews what happened and decides what has to happen next."],
        ["e", "Is a notification required?", "Certain events must be notified to the CQC or the local authority. This is where that call is made.", "decision"],
        ["f", "Inform the CQC, local authority and family as appropriate", "Notify in line with legal duties, including the Duty of Candour and safeguarding responsibilities."],
        ["g", "Begin internal investigation", "Investigate the event to understand what happened and why."],
        ["h", "Collect statements and evidence from service users and staff", "Gather accounts and evidence from everyone involved."],
        ["i", "Identify root cause and learning", "Establish why it happened, not only what happened."],
        ["j", "Document the investigation and findings in the incident report", "Write up the investigation and everything it found."],
        ["k", "Inform the CQC, local authority and family of the outcome as appropriate", "Close the loop with everyone who was notified at the start."],
        ["l", "Implement preventative actions", "Put in place the changes that reduce the risk of it happening again."],
        ["m", "Document and share lessons learned", "Use the findings to support continuous improvement in care quality.", "terminator", "blue"],
      ],
      [
        ["a", "b"], ["b", "c"], ["c", "d"], ["d", "e"],
        ["e", "f", "Yes"], ["e", "g", "No"], ["f", "g"],
        ["g", "h"], ["h", "i"], ["i", "j"], ["j", "k"], ["k", "l"], ["l", "m"],
        ["j", "c", "Record it", { colour: "red", dashed: true }],
      ],
    ),
  },

  /* ------------------------------------------------------------------- */
  {
    pageId: "8cc8f556-fb6e-46e5-9f61-a380c4b21a80",
    page: "Medication Management",
    heading: "Process Map: Administering Medication — the Six Rights",
    model: build(
      "Administering medication — the six rights",
      [
        ["a", "Right person", "Confirm the medication is being given to the right service user.", "terminator", "blue"],
        ["b", "Right medication", "Check that the right medication is being given, as prescribed."],
        ["c", "Right dose", "Check the right dose is given."],
        ["d", "Right time", "Give the medication at the right time."],
        ["e", "Right route", "Give the medication through the right route."],
        ["f", "Was the medication taken?", "A refusal or a missed dose does not stop the record being made — it changes what happens next.", "decision"],
        ["g", "Record the administration on the E-MAR", "Record the administration accurately in the E-MAR system.", "document"],
        ["h", "Report the refusal or missed dose to senior staff or a healthcare professional", "Report concerns, refusals or missed doses to senior staff or healthcare professionals.", "process", "red"],
      ],
      [["a", "b"], ["b", "c"], ["c", "d"], ["d", "e"], ["e", "f"], ["f", "g", "Yes"], ["f", "h", "No"], ["h", "g"]],
    ),
  },

  /* ------------------------------------------------------------------- */
  {
    pageId: "6d68fbf5-2de3-4c50-b83d-144b4c097afc",
    page: "Care & Support Notes",
    heading: "Process Map: Writing a Good Care Note",
    model: build(
      "Writing a good care note",
      [
        ["a", "Write at the time of care", "Record notes at the time of care or as soon as possible afterwards. Record only what actually happened — facts, not assumptions or opinions.", "terminator", "blue"],
        ["b", "Describe the support given and how the person responded", "Write enough detail for anyone reading to understand what support you gave, how the person responded, and whether anything else needs to happen."],
        ["c", "Make it specific to that person on that day", "Avoid repeating the same short phrases every day — even routine tasks should describe what happened for that person on that day. Capture preferences, mood and wellbeing, not just the task."],
        ["d", "Check the note against the care plan and risk assessments", "Make sure the note reflects the person's care plan and risk assessments."],
        ["e", "Has anything changed?", "If something about the person's needs or circumstances has changed, the note is not the end of it.", "decision"],
        ["f", "Record the change and inform the senior on duty", "Record the change clearly and note the action you took — for example informing the senior on duty.", "process", "amber"],
        ["g", "Store the note securely and confidentially", "Keep it confidential, focused on the person's care, and stored securely, so it stands alongside fluid charts, body maps and behaviour logs.", "terminator", "blue"],
      ],
      [["a", "b"], ["b", "c"], ["c", "d"], ["d", "e"], ["e", "f", "Yes"], ["e", "g", "No"], ["f", "g"]],
    ),
  },

  /* ------------------------------------------------------------------- */
  {
    pageId: "332c906e-452c-4545-8a38-2ad6aab43855",
    page: "Audits",
    heading: "Process Map: The Audit Cycle",
    model: build(
      "The audit cycle",
      [
        ["a", "Plan the audit — scheduled or unannounced", "Audits are carried out through a combination of scheduled and unannounced visits.", "terminator", "blue"],
        ["b", "Gather the evidence: documents, observation, conversations", "Review documentation, observe practice, and speak with staff, clients and families."],
        ["c", "Assess the areas in scope for that audit type", "Assess everything from care plans and medication records to staff training and incident management, according to the audit type — organisational, staff, service user or property."],
        ["d", "Analyse the findings and report with recommendations", "Analyse the findings and produce a detailed report with recommendations for improvement."],
        ["e", "Agree an action plan", "Turn the recommendations into agreed actions."],
        ["f", "Re-audit to track progress", "Re-audit to track progress against the action plan.", "process", "blue"],
      ],
      [["a", "b"], ["b", "c"], ["c", "d"], ["d", "e"], ["e", "f"], ["f", "b", "Re-audit"]],
    ),
  },

  /* ------------------------------------------------------------------- */
  {
    pageId: "ff0c9efe-fbe0-4a5a-9ac1-e02194eae3db",
    page: "Feedback",
    heading: "Process Map: Handling Informal Feedback",
    model: build(
      "Handling informal feedback",
      [
        ["a", "Concern raised", "Someone raises a concern informally rather than as a written complaint.", "terminator", "blue"],
        ["b", "Acknowledge it — listen, thank them, show empathy", "Listen, thank them, and show empathy. Do not minimise the issue."],
        ["c", "Try to resolve it the same day or by the next working day", "Aim to resolve it the same day or by the next working day."],
        ["d", "Resolved, and not serious?", "If it is unresolved or serious, it belongs in the formal complaint process instead.", "decision"],
        ["e", "Document it on the feedback form", "Use the feedback form — if the feedback was received verbally, you can still document it on the service user's behalf. The CQC expect all concerns to be recorded, even when dealt with informally.", "document"],
        ["f", "Upload to Airtable with a summary of the action taken", "Upload the feedback form to Airtable and add a summary of the action taken to address the concern.", "document"],
        ["g", "Escalate into the formal complaint process", "Move the complaint into the formal complaint process.", "process", "red"],
      ],
      [["a", "b"], ["b", "c"], ["c", "d"], ["d", "e", "Yes"], ["d", "g", "No"], ["e", "f"]],
    ),
  },
  {
    pageId: "ff0c9efe-fbe0-4a5a-9ac1-e02194eae3db",
    page: "Feedback",
    heading: "Process Map: Handling a Formal Complaint",
    model: build(
      "Handling a formal complaint",
      [
        ["a", "Complaint received", "A complaint is made formally, or an informal concern has been escalated.", "terminator", "blue"],
        ["b", "Document the complaint on the feedback form", "Use the feedback form — verbal complaints can be documented on the service user's behalf.", "document"],
        ["c", "Send an acknowledgement letter within 3 working days", "Send within 3 working days, confirming receipt and outlining the investigation timeline and plan.", "process", "amber"],
        ["d", "Investigate: gather evidence, speak to staff, review records", "Gather evidence, speak to staff, review records, and document every step."],
        ["e", "Do other professionals need to be involved?", "Some complaints need safeguarding teams, social workers or other agencies brought in.", "decision"],
        ["f", "Contact safeguarding, social workers or other agencies and document it", "Involve them, and document all communication."],
        ["g", "Send an outcome letter: findings, upheld or not, actions, apology where appropriate", "Explain the findings, state whether the complaint is upheld, outline the actions taken, and apologise where appropriate."],
        ["h", "Store all supporting evidence on Airtable", "Store letters, notes, emails, investigation material and meeting records.", "document"],
      ],
      [["a", "b"], ["b", "c"], ["c", "d"], ["d", "e"], ["e", "f", "Yes"], ["e", "g", "No"], ["f", "g"], ["g", "h"]],
    ),
  },

  /* ------------------------------------------------------------------- */
  {
    pageId: "8c3960f2-8867-4583-aee7-862df6b6608b",
    page: "Care Plans & Risk Assessment",
    heading: "Process Map: The Care Planning Process",
    model: build(
      "The care planning process",
      [
        ["a", "Initial assessment — getting to know the person", "Meet the person needing care for a relaxed conversation about their health, emotions and lifestyle, including hobbies, preferences and what's important to them.", "terminator", "blue"],
        ["b", "Risk assessment — looking out for safety", "Look at potential hazards that could cause harm or difficulty — falls, difficulties managing medicines, emotional stress — and create a risk assessment to reduce or manage them."],
        ["c", "Create the care plan and risk assessment", "Write a personalised guide detailing exactly what support the person needs and how it should be provided: daily routines, preferences, likes, dislikes, and specific instructions.", "document"],
        ["d", "Involve the person, their family and professionals", "Develop the plan alongside the person receiving care, their family, and relevant professionals such as nurses or doctors, so it truly reflects the individual's wishes and needs."],
        ["e", "Implement the plan", "Once agreed, put the plan into action — care workers and health professionals follow it closely, delivering the agreed support consistently."],
        ["f", "Monitor and adjust", "Regularly check that care needs are being met and the risk management plan is working. Adjust the plan when health or circumstances change."],
        ["g", "Review with the care team, service user and family", "Meet with the care team, the service user and their family to review what's working and what might need changing."],
        ["h", "Track outcomes against the person's goals", "Track how well the care is helping the person achieve their goals and improve their quality of life, adjusting the plan whenever needed."],
      ],
      [["a", "b"], ["b", "c"], ["c", "d"], ["d", "e"], ["e", "f"], ["f", "g"], ["g", "h"], ["g", "c", "Needs changing"]],
    ),
  },

  /* ------------------------------------------------------------------- */
  {
    pageId: "cc4a1ba0-9268-454a-8d2f-dc5ea9914df2",
    page: "Vehicles & Drivers",
    heading: "Process Map: Clearing a Driver to Drive on Agency Business",
    model: build(
      "Clearing a driver to drive on agency business",
      [
        ["a", "Check the driving licence is valid", "Confirm a valid UK or recognised driving licence before any staff member drives on agency business — in an agency vehicle or their own.", "terminator", "blue"],
        ["b", "Run the DVLA check using the share code", "Use the DVLA share code service. Repeat at least every 6 months — every 3 months for staff with endorsements."],
        ["c", "Take a medical fitness declaration", "Including any DVLA-notifiable conditions such as epilepsy, certain cardiac conditions, insulin-treated diabetes, or significant visual impairment."],
        ["d", "Record all checks on the staff file", "All checks must be in place and recorded on the staff file, alongside enhanced DBS, business-use insurance and evidence of vehicle roadworthiness.", "document"],
        ["e", "Cleared to drive on agency business", "Only once every check above is in place and recorded on the staff file.", "terminator", "blue"],
        ["f", "Points, an incident, or a notifiable medical condition?", "Clearance depends on nothing having changed since the checks were made.", "decision"],
        ["g", "Tell the Registered Manager immediately", "Drivers must notify the Registered Manager immediately if their licence status changes, they receive points, they are involved in an incident that affects their licence, or they develop a notifiable medical condition.", "process", "red"],
      ],
      [["a", "b"], ["b", "c"], ["c", "d"], ["d", "e"], ["e", "f"], ["f", "g", "Yes"], ["g", "b", "Re-check"], ["e", "b", "Every 6 months"]],
    ),
  },
  {
    pageId: "cc4a1ba0-9268-454a-8d2f-dc5ea9914df2",
    page: "Vehicles & Drivers",
    heading: "Process Map: Keeping a Vehicle Compliant",
    model: build(
      "Keeping a vehicle compliant",
      [
        ["a", "Vehicle used on agency business", "Every vehicle used on agency business has to keep all of the following current at once.", "terminator", "blue"],
        ["b", "MOT — annually, once over 3 years old", "Valid MOT, renewed annually, where the vehicle is over 3 years old."],
        ["c", "Vehicle tax — monthly, 6-monthly or annually", "Paid monthly, 6-monthly or annually."],
        ["d", "Business insurance — annually", "Renewed annually."],
        ["e", "Service — manufacturer's schedule", "In line with the manufacturer's schedule, typically annually."],
        ["f", "Visual spot check — every 6 months", "A visual spot check of the vehicle every 6 months."],
        ["g", "Log it in the Vehicle Log", "The spot check is logged in the Vehicle Log.", "document"],
      ],
      [["a", "b"], ["a", "c"], ["a", "d"], ["a", "e"], ["a", "f"], ["f", "g"]],
    ),
  },

  /* ------------------------------------------------------------------- */
  {
    pageId: "3acdc50c-df8a-49e7-bc45-156e12c9f99b",
    page: "Mental Capacity Act 2005",
    heading: "Process Map: Writing an MCA-Compliant Care Plan",
    model: build(
      "Writing an MCA-compliant care plan",
      [
        ["a", "Record the capacity assessment for that specific decision", "Record the specific decision assessed, who completed the assessment, when, the conclusion, and why the person was unable to understand, retain, weigh up or communicate the information. Never use blanket statements — capacity is decision-specific and time-specific.", "terminator", "blue"],
        ["b", "Record how the person is supported to decide", "Describe the practical steps staff take to help the person participate — easy-read materials, visual prompts, extra time, best time of day, trusted people — so every member of staff follows a consistent approach."],
        ["c", "Record any Lasting Power of Attorney and what it covers", "State whether an LPA exists, its type (health and welfare, or property and financial), who holds it, verification with the Office of the Public Guardian, and which decisions the attorney can make."],
        ["d", "Record advance statements and advance decisions — or that there are none", "An advance statement expresses wishes and must be considered; an ADRT is legally binding — for life-sustaining treatment it must be written, signed and witnessed. If neither exists, record that explicitly."],
        ["e", "Plan for fluctuating capacity", "Explain the nature of any fluctuation, the signs staff should look for, and how to respond — including delaying decisions until the person can participate."],
        ["f", "Document least restrictive practice", "For any restriction — a door sensor, a locked medication cabinet — record what it is, why it's necessary, and how the person was involved. Consent where they have capacity; a documented best-interest decision where they don't."],
        ["g", "Record advocacy — including where an IMCA is required", "Record any advocate's name, role and contact details. An IMCA must be appointed where a person lacking capacity has no one but paid staff to consult and the decision concerns serious medical treatment or a change of accommodation."],
      ],
      [["a", "b"], ["b", "c"], ["c", "d"], ["d", "e"], ["e", "f"], ["f", "g"]],
    ),
  },

  /* ------------------------------------------------------------------- */
  {
    pageId: "3300d97a-e495-4042-81ef-b61e57e6a5a1",
    page: "Staff Meeting",
    heading: "Process Map: Running a Staff Meeting",
    model: build(
      "Running a staff meeting",
      [
        ["a", "Review recent performance", "Begin with recent performance metrics — client satisfaction, care quality, and any incidents that have occurred.", "terminator", "blue"],
        ["b", "Cover compliance and regulation", "Discuss compliance and regulatory issues, ensuring all carers are current with the latest CQC requirements and best practices."],
        ["c", "Training and development", "Share upcoming training sessions and encourage continuous professional development."],
        ["d", "Review incidents and safeguarding", "Review recent incidents or safeguarding concerns and discuss their causes, identifying improvements so similar incidents can be prevented."],
        ["e", "Communication and care planning", "Check care plans are current and everyone knows their roles. Give carers space to share concerns or suggestions."],
        ["f", "Document the outcomes and share them with all carers", "Document the outcomes and share them with all carers, so everyone knows the key points discussed and the actions to be taken.", "document"],
      ],
      [["a", "b"], ["b", "c"], ["c", "d"], ["d", "e"], ["e", "f"]],
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
        ${renderProcessMapBlock(m.model)}
      </section>`,
  ).join("");

  return `<!doctype html><meta charset="utf-8"><title>Process map preview</title>
  <style>
    :root{--foreground:222 47% 11%;--muted-foreground:215 16% 47%}
    body{font:14px/1.5 system-ui,sans-serif;background:#f6f7f9;margin:0;padding:32px;color:#111}
    section{background:#fff;border:1px solid #e3e6ea;border-radius:10px;padding:22px;margin:0 auto 26px;max-width:1180px}
    h2{margin:0 0 2px;font-size:15px;color:#6b7280;font-weight:600}
    h3{margin:0 0 18px;font-size:19px;border-bottom:1px solid #eef0f3;padding-bottom:14px}
    .process-map-layout{display:grid;grid-template-columns:minmax(280px,5fr) minmax(0,7fr);gap:1.75rem;align-items:start}
    .process-map-figure{overflow-x:auto;min-width:0}
    .process-map-steps{list-style:none;margin:0;padding:0}
    .process-map-step{display:flex;gap:.7rem;align-items:flex-start;padding:0 0 .9rem}
    .process-map-step-num{flex:0 0 auto;width:1.45rem;height:1.45rem;border-radius:999px;display:flex;align-items:center;justify-content:center;font-size:.72rem;font-weight:600;color:#fff;margin-top:.1rem}
    .process-map-step-body{display:block;min-width:0}
    .process-map-step-title{display:block;font-weight:600;font-size:.92rem;line-height:1.35}
    .process-map-step-note{display:block;margin-top:.2rem;font-size:.85rem;line-height:1.5;color:#5b6470}
  </style>${cards}`;
}

/**
 * Rebuilds each page's process-map section from scratch. Everything from the
 * first "Process Map:" heading to the end of the page was written by this
 * script, so replacing that tail wholesale is both safe and the only way to
 * be certain the old separate step lists are gone.
 */
export function sqlStatements(): string {
  const byPage = new Map<string, MapInsertion[]>();
  MAPS.forEach((m) => {
    const list = byPage.get(m.pageId) ?? [];
    list.push(m);
    byPage.set(m.pageId, list);
  });

  return [...byPage.entries()]
    .map(([pageId, maps]) => {
      const section = maps
        .map((m) => `<h2>${m.heading}</h2>` + serialiseProcessMap(m.model))
        .join("");
      return (
        `update public.pages set content = left(content, position('<h2>Process Map:' in content) - 1) || ` +
        `$map$${section}$map$, updated_at = now() ` +
        `where id = '${pageId}' and position('<h2>Process Map:' in content) > 0;`
      );
    })
    .join("\n\n");
}
