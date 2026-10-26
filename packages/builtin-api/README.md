# Built-in public API

This package exposes domain contracts and extension capabilities shared by Asterism's built-in implementation and external plugins.

It lets a plugin interact with existing Agent behavior, offer creation capabilities, or contribute Agent presentation without importing the implementation.

Public declarations retain their identity across consumers. The package is a shared domain boundary, not a second installed plugin and not a grant of private object access.

General hosting facilities belong to the SDK. Built-in-specific behavior belongs here only when it is intentionally public.
