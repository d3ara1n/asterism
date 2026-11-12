# User-defined workflows

A workflow is the user's arrangement for accomplishing work: who acts, which methods they use, how they exchange results, and what counts as finished. In Asterism, users express that arrangement through assistant roles, skills, and the workbench's resources and links. An assistant can help construct and operate it from the user's instructions.

An Agent paradigm describes a general interaction and organizational model; plugins supply the capabilities used to realize it. One plugin can support several paradigms, and a workflow can combine their organizational patterns. The harness describes available primitives, their inputs and outputs, and execution boundaries; it does not supply a prescribed workflow. The examples here illustrate user choices, not default Agent behavior or mandatory sequences.

## Expressing a workflow

| Element | What the user defines |
| --- | --- |
| Assistant role | Responsibility, expertise, standards, and decisions entrusted to an Agent |
| Skill | A reusable method, task procedure, or handoff convention to read when relevant |
| Workbench arrangement | Participating Agents, material, capabilities, communication links, and views for following the work |
| Task instructions | The current goal, scope, deliverables, completion criteria, and decisions reserved for the user |

In builtin, an Agent configuration can carry a reusable assistant role. That responsibility is distinct from the model choice used to perform the work. A workflow responsibility can also be assigned through task instructions without adding a reusable configuration.

Skills can describe detailed procedures because they are selected methods, not infrastructure contracts. A skill does not supply missing resources, executable capabilities, or permission to act.

Workbench layout has two aspects. The resource and link arrangement determines who can use which objects and communication routes. Card placement and open views help the user follow the work. Putting a reviewer card beside an implementer does not schedule a review, and drawing a resource link does not establish execution order.

A workbench template is useful for a recurring starting arrangement. Reusing that arrangement does not establish the new task’s goal, schedule its handoffs, or continue the previous conversation.

## Supervisor workflow with built-in Agents

A supervisor workflow assigns one Agent the communication and follow-through that the user would otherwise perform with another Agent. The supervisor advances the work through task clarification, progress investigation, feedback, and follow-up instructions within the user's delegated scope.

For example, the user can ask a supervisor to coordinate an implementation Agent until an agreed change is ready for the user's review. The implementation Agent performs the work; the supervisor maintains the goal and acceptance criteria, examines available progress and results, and requests corrections or the next increment. The user remains responsible for decisions they have reserved.

Both participants are ordinary built-in Agents. Supervision is an assigned relationship, not a special Agent type, a new paradigm, or privileged runtime control.

### Arrange participants and access

A user-defined setup can contain:

- A supervisor Agent with the objective, acceptance criteria, and responsibility for following through.
- A working Agent with the execution responsibility and the resources needed for its task.
- A communication route for assignments and follow-up questions.
- A return route for the working Agent’s reports and questions. Communication in one direction does not establish the reverse route.
- Notes or files for shared material when useful, linked separately to each participant that needs them.

The supervisor does not inherit the working Agent’s resources. If it needs to inspect the actual output, give it the corresponding resource access. Reading the worker’s account of its work is not equivalent to examining the underlying files or external service state.

### Define the supervision agreement

The user can specify the following in role instructions, a skill, or the initial task:

- The result to achieve and the evidence needed to consider it complete.
- Which assignments, clarifications, and corrections the supervisor may handle independently.
- Which decisions and external actions require the user's approval.
- What the worker should report, and when a blocker should return to the supervisor or user.
- When supervision ends, including completion, an unresolved blocker, or a user request to stop.

For example, a user might choose:

> Coordinate the implementation Agent for the agreed change. Handle routine clarification and ask for corrections against the acceptance criteria. Bring scope changes and commit requests back to me. Stop when the result is ready for my review or progress requires a decision only I can make.

This is example user instruction, not a harness rule. The supervisor's name or role does not grant additional access or turn its messages into user approval.

### Define evidence and follow-through

Input acceptance, task completion, and acceptance of the result are separate facts. A delivered assignment does not mean the worker finished, and a stopped response does not establish that the deliverable meets the criteria. Decide what evidence the supervisor should examine before declaring the work ready.

The user chooses the follow-up agreement: what the worker reports, who investigates missing progress, and when an unresolved question returns to the user. A role assignment alone does not install monitoring or recurring execution. Ongoing coordination depends on the availability of its participants and the capabilities chosen to support it.

This workflow reduces the user's routine relay work. It does not transfer reserved approvals or guarantee independent validation of the result; the user defines the evidence and review responsibilities.

## Other ways to divide responsibility

Builtin resources support different organizational models without requiring a new plugin for each one. A workflow defines how those participants carry out a particular task. Examples include:

- **Implementer and reviewer:** one Agent produces changes; another examines them against user-defined criteria and returns findings.
- **Parallel research and synthesis:** several Agents investigate separate questions, then another combines their reports. A Subagent Pool can serve bounded investigations; workbench Agents suit continuing conversations.
- **Planner and executor:** one Agent proposes or maintains a plan while another performs approved steps, with user-defined boundaries for replanning.
- **Peer collaboration:** Agents exchange findings directly without a permanent coordinator, using agreed responsibilities and a way to resolve open decisions.

A Router–Worker arrangement gives one participant responsibility for dispatch and synthesis. Define assignment and reporting in user instructions or skills, and give each participant the resources its work requires. This changes the organization of the work without inherently requiring another implementation. Additional plugins become useful when the arrangement needs additional capabilities, such as enforced execution dependencies, rather than merely a different division of responsibility.
