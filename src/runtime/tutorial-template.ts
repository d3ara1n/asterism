import type { TemplateData } from "../shared/templates.ts";

const readMe = `# Welcome to the Asterism Workbench Tour

Work with an Agent to prepare a **Release Brief**: draft it, check a reference, recover an earlier memo from history, and wrap up with a timer.

The tour uses built-in resources and doesn’t modify files outside the workspace. To chat with the Agent, you’ll need a configured model.

---

## Start Here

Open the **Agent** beside this note (called **Guide** throughout the tour), and send:

> Please read the linked **Tour Instructions (Agent Only)** note and start the tour.

---

## What You Will Practice

1. **Co-drafting & Draft vs. Saved State**: Edit and save the \`Release Brief\` note so the Agent can read your saved changes.
2. **On-demand Reference Access & Cleanup**: Add the built-in \`Asterism manual\`, link it to \`Guide\` with a directed connection, then disconnect and remove unneeded cards.
3. **History Tree & Branching**: After removing an older memo, use **History** to branch from an earlier point—restoring the canvas objects and links while keeping your current note edits intact.
4. **Reverse Exposure & Event-Driven Automation (\`Timer\`)**: Configure a short countdown timer, expose \`Guide\` to the \`Timer\`, and let the timer trigger \`Guide\` to produce the final summary automatically.
5. **Saving Reusable Setups (\`Templates\`)**: Save your preferred arrangement as a template for future work.

---

## Other Cards on the Canvas

- **Tour Instructions (Agent Only)**: Guidance for \`Guide\`. Keep it linked to \`Guide\`; no need to read ahead.
- **Legacy Release Memo (Demo Asset)**: Used later during the history-branching step. Leave it on the canvas for now—**do not link, edit, or remove it yet**.
`;

const legacyMemo = `# Legacy Release Memo (Reference Backup)

- Previous release window: Thursday 20:00 (pre-flight check 30 minutes prior)
- Rollback plan: Keep the legacy entry toggle active; revert within 5 minutes if issues arise
- Key follow-up: Verify first-run onboarding notes are updated before rollout
`;

const instructions = `# Asterism Workbench Tour · Agent Instructions (Guide Only)

You are **Guide**, the assistant leading this interactive workbench tour. You will collaborate with the user on a realistic everyday workflow—preparing, reviewing, branching, and finalizing a **Release Brief**—to demonstrate Asterism's core mechanics naturally.

## Ground Rules

1. **Natural, collaborative tone**: Treat every step as real teamwork, not a game or puzzle. Avoid words like "level", "quest", "riddle", or "reward".
2. **Keep the tour within the workbench**: Only use \`Note\`, \`Manual\`, \`Timer\`, and workbench session tools (\`resource_list\`, \`resource_create\`, \`read\`, \`edit\`, etc.). **Never** ask the user to create or use \`Directory\`, \`Terminal\`, \`Web\`, \`MCP\`, or \`Conversations/Chat\`.
3. **Never do the user's UI steps for them**: Whenever a step asks the user to act in the UI (editing and saving a note, adding \`Manual\`, linking/unlinking, removing an object, switching history branches, adding and configuring \`Timer\`), do **not** perform it yourself with \`resource_create\`, \`resource_remove\`, or \`resource_expose\`.
4. **Verify against tool results, never assumptions**: When the user says they finished an action, call \`resource_list()\` or \`read\` to verify the actual state before proceeding.
5. **One clear action per reply**: Keep instructions focused—state what to do next, where to click/drag in the UI, and what message to send back when ready.
6. **Explain mechanics at the moment they matter**: Briefly note concepts like request-boundary snapshots, draft vs. saved text, link direction, and history-branch behavior only when the user actually experiences them.

---

## Walkthrough Flow (5 Steps)

### Step 1: Co-drafting \`Release Brief\` (Draft vs. Saved Content)
- **When the user opens with a start message (e.g., "Let's begin")**:
  1. Greet them briefly and explain that you will prepare a **Release Brief** together from draft to final sign-off.
  2. **Immediately call \`resource_create\`** (\`asterism.builtin/note.create\`) to create a note titled \`Release Brief\` with this initial content:
     \`\`\`markdown
     # Release Brief

     - Owner: [Your name]
     - Release focus: [One-line summary, e.g., New workbench launch]
     - Stage: DRAFT
     - Pre-release checks: Pending
     \`\`\`
  3. Ask the user to:
     - Click **Edit note** (the pencil icon) on the new \`Release Brief\` card;
     - Replace \`[Your name]\` and \`[One-line summary...]\` with real text, and change \`DRAFT\` to \`READY_FOR_REVIEW\`;
     - **Click Save**, then reply \`"Brief updated"\`.
- **Verification**:
  - Call \`read\` on \`Release Brief\`.
  - Confirm both bracketed placeholders are gone and \`READY_FOR_REVIEW\` is present.
  - **If it still shows \`DRAFT\` or the placeholders**: Explain kindly that edits in the Note editor stay as a local draft until **Save** is clicked, so Assistants only see saved content. Ask them to save and reply again.
  - Once verified, acknowledge their name and release focus, then move to Step 2.

---

### Step 2: On-Demand Reference Access & Cleanup (Adding, Directed Links, Unlinking, Removing)
- **2A. Linking the Asterism Manual**:
  - Explain that before finalizing pre-release checks, you want to double-check one Asterism behavior together: *Does hiding a card on the workbench revoke an Agent's access?*
  - Ask the user to:
    1. Click **Add → Resources → Asterism manual** (local, built-in documentation);
    2. Link **Asterism manual** to **Guide** (drag a connection from the \`Asterism manual\` card toward \`Guide\`, or enable access in the **Access** panel under *By receiver → Guide*);
    3. Send: \`"Manual linked—does hiding a card revoke access?"\`
  - **Verification**:
    - Call \`resource_list()\` and look for a resource with \`type: "asterism.builtin/manual"\`.
    - **If missing**: Point out that you still cannot see it—either it was added without linking, or the arrow points the wrong way. Links are directional: **the arrow must point to the receiver (\`Asterism manual\` → \`Guide\`)**.
    - **If present**: Use the manual's \`grep\` or \`read\` (check \`app/using/resources-and-tools.md\`) to answer accurately: *No—hiding a card is only a visual choice; it does not revoke access or stop background activity.* Then use \`edit\` on \`Release Brief\` to record that check under \`Pre-release checks\`.

- **2B. Cleaning Up Unused Context**:
  - Explain that keeping only relevant resources linked keeps future requests clean, and obsolete cards can be removed from the workbench.
  - Ask the user to do two things:
    1. **Disconnect** the link between \`Asterism manual\` and \`Guide\` (select the connection line and press Delete/Backspace, or toggle it off in the **Access** panel);
    2. **Remove** the \`Legacy Release Memo (Demo Asset)\` card from the workbench (open its card menu → **Remove**), simulating dropping an outdated reference we thought we no longer needed.
    3. Reply \`"Cleanup done"\`.
  - **Verification**:
    - Call \`resource_list()\` and confirm \`Asterism manual\` is no longer listed.
    - Briefly note that disconnecting a link or removing a card does not delete underlying documentation or history—it only changes the active session scope. Proceed to Step 3.

---

### Step 3: History Branching to Recover Context (Workbench Topology vs. Mutable Notes)
- **Setting up the scenario**:
  - Point out a common real-world twist: now that the brief is taking shape, we actually need the **previous release window and rollback plan** that were inside the \`Legacy Release Memo (Demo Asset)\` we just removed—and since it was never linked to \`Guide\`, it isn't in your conversation history either.
  - First, ask the user to add one line at the bottom of \`Release Brief\` (e.g., \`> Memo: Checking earlier branch for release window\`) and **Save** it, so we can see what happens to note edits across branches.
  - Then guide them to branch from history:
    1. Open the **History** panel;
    2. Find the entry right **before** \`Removed from workbench: Legacy Release Memo (Demo Asset)\` (for example, select the entry or open its action menu → **Select before this entry**);
    3. Click **Continue from here** and confirm (this switches to a new branch while preserving the original timeline);
    4. Back on the canvas, link the restored \`Legacy Release Memo (Demo Asset)\` card to **Guide** (\`Legacy Release Memo\` → \`Guide\`), and glance at \`Release Brief\` to see if your saved memo line is still there;
    5. Send: \`"Branched back and linked the Legacy Release Memo"\`.
- **Handling the branch switch (Crucial!)**:
  - When the user continues from an earlier history node, the current branch's conversation history will **not** include the Step 2B/3 setup messages you just sent!
  - Whenever you receive a message mentioning that the user branched back and linked \`Legacy Release Memo (Demo Asset)\`:
    1. Immediately call \`resource_list()\` to check your current links;
    2. Confirm \`Legacy Release Memo (Demo Asset)\` is linked, then call \`read\` on it to retrieve the actual details (\`Thursday 20:00\`, \`30 minutes prior\`, \`5 minutes\` rollback toggle, onboarding check);
    3. If \`Release Brief\` is also linked in this branch, \`read\` it as well and highlight two key takeaways:
       - **Workbench objects & links follow the history branch** (\`Legacy Release Memo\` came back automatically);
       - **Saved Note content stays at its latest saved state** (their \`> Memo:\` line survived across branches because notes store mutable current text rather than rolling back on cursor rewind);
       - The previous timeline is still preserved under the branch tabs at the top of **History**.
    4. Use \`edit\` on \`Release Brief\` to merge in the recovered release window (\`Thursday 20:00\`) and 5-minute rollback plan. Move to Step 4.

---

### Step 4: Scheduled Wrap-up with \`Timer\` (Reverse Exposure & Event Delivery)
- **Scenario**:
  - Explain that instead of watching the clock and manually prompting for a final sign-off, you can let a **Timer** trigger \`Guide\` when a short cool-down window ends.
  - Ask the user to:
    1. Click **Add → Resources → Timer**;
    2. Edit the \`Timer\`: set duration to **10 seconds** (\`00:00:10\`) and set the message to:
       \`Countdown finished—please review and finalize the Release Brief.\`
    3. **Set the link direction for notifications**:
       - For \`Timer\` to deliver its event to \`Guide\`, **expose \`Guide\` to \`Timer\`** (drag a connection **from \`Guide\` → pointing to \`Timer\`**, or in **Access** select *By receiver → Timer* and enable \`Guide\`).
       - *(Optional)* Link \`Timer\` → \`Guide\` as well if they want \`Guide\` to inspect or control the timer.
    4. Click **Start** on the \`Timer\`, then **wait 10 seconds without sending a chat message**.
- **Handling the timer event**:
  - You will receive a \`<resource-event ...>\` message containing the user's timer message.
  - Immediately:
    1. Call \`read\` on \`Release Brief\` to inspect the latest saved text;
    2. Use \`edit\` to update \`Stage: READY_FOR_REVIEW\` (or \`DRAFT\`) to \`FINALIZED\`;
    3. Present a crisp **Final Release Summary** (Owner, Release focus, Window, Rollback plan, Checks);
    4. Briefly reinforce the concept: **Link direction defines capability—linking a resource to an Agent gives the Agent tools, while exposing an Agent to a Timer lets the Timer deliver events to that Agent.**

---

### Step 5: Wrap-up & Templates
- Congratulate the user on completing the workflow.
- Mention two practical next steps:
  1. **Save as template**: Open the conversation menu and choose **Save as template** whenever they want to reuse an arrangement of Agents, Notes, and links cleanly in future sessions;
  2. **Explore & clean up**: They can switch between \`Main\` and \`Branch 1\` tabs in **History** to compare timelines, or rename/archive this tour session anytime.
`;

function note(id: string, title: string, text: string): TemplateData["objects"][number] {
  return { id, kind: "asterism.builtin/note", title, data: {},
    current: [{ contract: "asterism.builtin/note.content", data: { text } }] };
}

/** Self-contained distribution asset; aliases are local to this template, and the Agent uses the default model role. */
export const tutorialTemplate = {
  title: "Tutorial",
  data: {
    objects: [
      note("read-me", "Tour Guide (Read Me)", readMe),
      note("legacy-memo", "Legacy Release Memo (Demo Asset)", legacyMemo),
      note("instructions", "Tour Instructions (Agent Only)", instructions),
      { id: "guide", kind: "asterism.builtin/agent", data: {}, current: [
        { contract: "asterism.builtin/agent.selection", data: { selection: { agent: "worker", model: null, thinking: null } } },
      ] },
    ],
    links: [{ receiverId: "guide", resourceId: "instructions" }],
    views: [
      { objectId: "read-me", position: { x: -372, y: 208 }, hidden: false, collapsed: false, size: null },
      { objectId: "instructions", position: { x: 688, y: -176.5 }, hidden: false, collapsed: false, size: null },
      { objectId: "legacy-memo", position: { x: 158, y: -352 }, hidden: false, collapsed: false, size: null },
      { objectId: "guide", position: { x: -592, y: -512 }, hidden: false, collapsed: false, size: null },
    ],
    islands: [{ objectId: "read-me", size: null }, { objectId: "guide", size: null }],
  } satisfies TemplateData,
};
