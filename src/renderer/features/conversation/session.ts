import { ConversationController, SubmissionIdentity } from "./controller";

/** 每个代理对话一份视图会话：卡片与历史浮岛共享同一控制器，草稿提交身份随会话保留。 */
export interface ConversationSession { controller: ConversationController; submission: SubmissionIdentity }
const sessions = new Map<string, ConversationSession>();

export function conversationSession(taskId: string, agentId: string): ConversationSession {
  const key = `${taskId}:${agentId}`;
  let session = sessions.get(key);
  if (!session) {
    session = { controller: new ConversationController(window.weft.conversation, taskId, agentId), submission: new SubmissionIdentity() };
    sessions.set(key, session);
  }
  return session;
}
