import type { DesktopBridge } from "../shared/contracts";
import { desktopBridgeKey } from "../shared/core";
declare global { interface Window { [desktopBridgeKey]: DesktopBridge; } }
