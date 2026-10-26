# Asterism

A local-first personal workbench for working with agents.

Agents, resources, and work history share one canvas. Supply material, link it to the agents that need it, inspect operations, and continue from saved work or another history branch.

The project is in early development.

## Install

Installers are available from [GitHub Releases](https://github.com/d3ara1n/asterism/releases): DMG for macOS Apple Silicon, EXE for Windows x64, and AppImage for Linux x64.

On macOS, drag Asterism into Applications. Builds use a fixed self-signed certificate. If quarantine prevents opening a download whose source you trust:

```bash
xattr -dr com.apple.quarantine /Applications/Asterism.app
```

Configure a model connection in Settings, then start a task from Home. Add resources and link them to the agent that needs them.

Resource access controls model context and operation scope. Shells, terminals, plugins, and MCP servers run with the current operating system user's capabilities. Branching history does not roll back external files.

## Develop locally

Use npm and a Node version compatible with the package's engine requirement:

```bash
npm install
npm run dev
```

The package scripts define checks, builds, and packaging. Development and installed runs use separate application data. Real sessions and credentials stay outside the repository.

## Documentation

The project maintains an English internal manual for models to consult when helping with software use or plugin development. Its resource/tool integration is planned.

Engineering documents serve development of Asterism itself. Each document explains its own topic independently, without a required reading sequence, source-file index, or cross-document dependency.
