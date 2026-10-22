import { connectionPortMessage, type RuntimeFrame } from "../shared/connection";
import { RuntimeClient } from "../shared/runtime-client";
import { ChannelClient } from "../shared/channel-client";
import { applicationBrand } from "../shared/application";

/** 页面唯一的任务进程直连；模块加载即建立，端口到达前的请求按序排队。 */
export const runtime = new RuntimeClient();
/** 对象级双工通道；连接失效时全部以 disconnected 结束。 */
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
// 监听先于请求注册，端口不会早于接收方到达。
window.host.connectRuntime();
