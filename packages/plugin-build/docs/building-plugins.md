# Deliver a plugin artifact

The application loads completed plugin artifacts; it does not compile plugin source on startup. Treat authoring, building, and loading as distinct checks. Consult the target builder's source and command help for configuration and invocation.

## Preserve runtime identity

Compile plugin-owned implementation and public declarations together within their realm. Keep backend and browser dependencies on their respective sides. Dependencies supplied by the application or another enabled plugin stay external; bundling a private copy would split shared identity even when its types agree. Keep private dependencies with the plugin and validate that their installed files are sufficient outside the development workspace.

## Deliver and verify the same package

Build from a clean checkout and inspect what is actually packed. Ship the completed artifact and any metadata and resources that it references; users should not need the authoring toolchain. Check styles, lazy code, workers, and assets when the plugin depends on them, not just the entry that loads first.

Test the artifact in the intended application and with the intended providers. A failed build is not a new artifact, and rebuilding while the host is running does not update its captured graph. Restart before evaluating the new build. A typecheck cannot establish that delivered files load or that the plugin works after installation.
