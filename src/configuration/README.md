# Application configuration

Global configuration is independent of session history. It describes provider connections, model selections, reusable roles, and agent behavior.

Separate saved values from their effective interpretation. Built-in defaults and explicit overrides have different ownership; changing one effective record should not silently change another's inheritance baseline.

Network discovery and parameter lookup are explicit operations. They report unknown or ambiguous information instead of guessing from a name.

Provider registration, protocol adaptation, credential storage, and usage display are separate responsibilities. A service catalog does not imply one mandatory consumer or cache policy.
