# Asterism SDK

The SDK defines the shared language between Asterism and plugins: contracts, host capabilities, and contributions.

Pure declarations can be shared across execution environments. Backend interfaces support work and persistence; frontend interfaces support presentation and interaction.

The SDK describes generic mechanisms. Agent conversation, naming, and other domain behavior belong to the plugin that implements them.

Public interfaces should express a capability an author needs. Internal decomposition is not itself a reason to expose another abstraction.
