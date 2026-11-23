import { usageRelations, usageSubjectKinds } from "@asterism-app/sdk/contracts";

/** The Skills view uses only observations made by the bundled paradigm. */
const declaredBy = "asterism.builtin";
export const successfulSkillReads = { kind: usageSubjectKinds.skill, relation: usageRelations.read, declaredBy, successfulTool: true } as const;
export const skillCatalogContext = { kind: usageSubjectKinds.skillCatalog, relation: usageRelations.context, declaredBy };
