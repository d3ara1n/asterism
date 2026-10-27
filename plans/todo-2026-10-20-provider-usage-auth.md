# Provider authentication and usage expansion

Filed on 2026-10-20.

Preset composition, usage-provider catalogs, built-in queries, response-header interpretation, and independent toolbar consumption are implemented. This task covers further authentication and service integration.

## Established direction

OAuth belongs to authentication composition. Generic settings should present the required interaction while concrete implementations own vendor differences.

Choose data shapes from an actual integration. Do not add empty configuration containers or fake login entries for unsupported methods. Fixed connection authentication still permits credential replacement, login, and logout.

This is demand-driven extension work, not a prerequisite for delivering the current SDK. Each selected integration must establish request capture, credential refresh ownership, and the view exposed to existing connection and usage consumers. The current connection and credential APIs retain their supported scope until that concrete design is implemented.

Evaluate an endpoint-field rename together with the authentication model, covering persistence and consumers as one change rather than retaining competing fields.

## Remaining work

- [ ] Select and integrate real model-provider OAuth flows, including login, refresh, logout, and invalid credentials.
- [ ] Verify each additional balance or plan query against its actual interface, authentication, units, and product access.
- [ ] Confirm reliable fields and amount units before adding a Kimi Code recharge-wallet view.
- [ ] Verify the credential boundary and user presentation for each new integration.

Other providers have no assigned implementation order. Earlier research endpoints are evidence to recheck, not permanent configuration defaults.
