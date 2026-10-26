# Storage preparation

Prepare persistent formats before starting business services. Preparation decides from format versions; business readers own payload validation.

Migrations form an explicit consecutive chain and commit atomically within each storage boundary. Published transformations remain stable rather than changing with ordinary business helpers.

Recovery preserves the application data group before conversion or replacement. Caches are reconstructible and have different retention needs. External resource effects remain outside application-data restoration.

Plugin preparation is independent of its normal runtime setup. A plugin data failure can prevent that plugin from loading without preventing unrelated application use.
