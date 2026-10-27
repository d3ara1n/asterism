import { connectionPortMessage, type RuntimeFrame } from "../shared/connection";
import { RuntimeClient } from "../shared/runtime-client";
import { ChannelClient } from "../shared/channel-client";
import { applicationBrand } from "../shared/application";

/** The page's sole direct connection to the task process; established at module load, with requests queued in order until the port arrives. */
export const runtime = new RuntimeClient();
/** Object-level duplex channels; all end as disconnected when the connection becomes invalid. */
export const channels = new ChannelClient(runtime.channels);

const fail = (message: string) => { runtime.fail(message); channels.disconnect(); };
window.addEventListener("message", event => {
  if (event.source !== window || event.data?.type !== connectionPortMessage) return;
  const port = event.ports[0];
  if (!port) { fail(`The workspace is unavailable. Restart ${applicationBrand.en} to reopen it.`); return; }
  runtime.attach({
    post: message => port.postMessage(message),
    onMessage: listener => { port.onmessage = message => listener(message.data as RuntimeFrame); },
    close: () => port.close(),
  });
  port.start();
});
window.host.onStatus(status => {
  if (status === "unavailable" || status === "stopping") fail(`The task runtime has stopped. Restart ${applicationBrand.en} to reopen the workspace.`);
});
// Register listeners before sending the request so the port cannot arrive before its receiver is ready.
window.host.connectRuntime();
