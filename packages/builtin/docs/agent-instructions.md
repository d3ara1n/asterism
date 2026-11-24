# Global and directory Agent instructions

Use `~/.agents/AGENTS.md` for personal guidance that should apply across workspaces, such as response preferences. Asterism Essentials includes this optional file in each Agent conversation and subagent request, even when no Directory resource is linked. Changes to the file take effect on the next request.

Use `AGENTS.md` at the root of a linked Directory resource for project-specific guidance, such as which checks to run. The global file and directory files are separate context blocks, with the global block first. Directory context follows the Agent's links, or the pool's links for a subagent. Unlinking a Directory removes its context from subsequent requests without affecting the global file.

To see which files were included, open **Context** in the Agent panel and look under **System prompt → Injected context**. The entries show paths and character counts from the latest recorded request, not a live list of files or their contents.

These files are sent to the model as context, so keep secrets out of them. Including the contents and source path does not grant file-tool access. Reading or editing a file through Directory tools still requires a linked Directory that covers it and a policy that allows the operation.
