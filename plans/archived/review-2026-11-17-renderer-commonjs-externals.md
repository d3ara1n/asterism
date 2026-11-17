# Renderer CommonJS external imports

Filed on 2026-11-17 after the user exercised the development application's plugin interface. The builtin plugin remained selected, but its renderer failed during module import with an external React `require` error. Earlier build and ESM integration checks had not exercised this CommonJS dependency path; their success did not establish GUI acceptance.

## Cause and disposition

The builtin renderer bundles `use-sync-external-store`, whose CommonJS implementation requires React. Ordinary external classification preserved that require in browser ESM, where no Node require function exists.

The builder now uses the existing Vite-exported Rolldown ESM external-require plugin. Explicit matchers cover renderer host imports and declared public dependencies; exact owned public entries remain in the plugin's graph. The conversion uses shared ESM values rather than installing a browser require function or bundling another React. Backend external resolution is unchanged. No dependency was added.

A process-backed builder regression reproduced the user's exact missing-require error before the correction. After correction it loads a private CommonJS dependency through native ESM without require, checks host object and provider class identity, exercises a lazy CommonJS import, and verifies an overlapping owned public entry remains local. A private React fixture throws if incorrectly bundled.

## Validation and acceptance

Backend/renderer typechecks passed. The opt-in suite passed 26 host/loader/installer/external-example tests and ten builder fixtures. Builtin was rebuilt, and inspection confirmed the failing external React require calls are absent while React remains a recorded shared import.

After restarting the development application to capture the rebuilt artifact, the user confirmed that the builtin interface worked on 2026-11-17. No running plugin graph was hot-replaced. This accepts recovery from the reported renderer failure, not external-plugin installation, npm management, or other platforms. No real data was changed and no publication occurred. The already-published builder 0.1.0 does not contain this correction; independent authors need a subsequent published version for this CommonJS dependency case.
