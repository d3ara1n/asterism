import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MessageChannel } from "node:worker_threads";
import { afterEach, expect, it } from "vitest";
import { z } from "zod";
import { defineChannel, defineCreation, pluginNamespace, type ChannelEnd } from "@atelier/sdk/contracts";
import { definePlugin, implementChannel, implementCreation, implementResource, type PluginContext } from "@atelier/sdk/runtime";
import { ApplicationService } from "./service.ts";
import { RendererConnection } from "./connection.ts";
import { RuntimeClient } from "../shared/runtime-client.ts";
import { ChannelClient } from "../shared/channel-client.ts";
import type { RendererFrame, RuntimeFrame } from "../shared/connection.ts";

const ns = pluginNamespace("test.connection");
const Probe = ns.resource("probe", z.strictObject({}));
const ProbeView = ns.data("card", z.strictObject({}));
const CreateProbe = defineCreation(Probe, { id: ns.name("create"), schema: z.strictObject({}) });
const Echo = defineChannel<string, string>(ns.name("echo"));

const services: ApplicationService[] = [], roots: string[] = [];
afterEach(async () => {
  for (const service of services.splice(0)) await service.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

// 直连契约：请求经端口往返；连接关闭（renderer 重载或页面销毁）结束该连接上的通道，后台端以 disconnected 收到。
it("请求经直连端口往返，连接关闭结束其通道", async () => {
  const root = mkdtempSync(join(tmpdir(), "atelier-connection-")); roots.push(root);
  const ended: ChannelEnd[] = [];
  let context!: PluginContext;
  const service = new ApplicationService(root, { plugins: [definePlugin({ namespace: ns, version: "1", setup(plugin) {
    context = plugin;
    return {
      resources: [implementResource(Probe, ProbeView, { records: [],
        creation: implementCreation(CreateProbe, { create: () => ({ title: "Probe", data: {} }) }),
        project: () => ({}), inspect: async () => ({}) })],
      channels: [implementChannel(Echo, channel => {
        channel.onMessage(text => channel.send(text.toUpperCase()));
        channel.signal.addEventListener("abort", () => ended.push(channel.signal.reason as ChannelEnd), { once: true });
      })],
    };
  } })] });
  services.push(service);
  const sessionId = service.sessions.tree.create("Connection");
  const ref = await context.session(sessionId).create(CreateProbe, {});

  const { port1, port2 } = new MessageChannel();
  const connection = new RendererConnection(service, {
    post: frame => port1.postMessage(frame),
    onMessage: listener => port1.on("message", frame => listener(frame as RendererFrame)),
    close: () => port1.close(),
  });
  const client = new RuntimeClient();
  client.attach({
    post: frame => port2.postMessage(frame),
    onMessage: listener => port2.on("message", frame => listener(frame as RuntimeFrame)),
    close: () => port2.close(),
  });
  const channels = new ChannelClient(client.channels);
  try {
    const read = await client.session.execute({ type: "read", sessionId });
    expect(read).toMatchObject({ ok: true, reply: { kind: "view", data: { sessionId } } });

    const channel = channels.open(Echo, ref);
    const reply = new Promise<string>(resolve => channel.onMessage(resolve));
    channel.send("ping");
    expect(await reply).toBe("PING");

    connection.close();
    await expect.poll(() => ended).toEqual([{ reason: "disconnected" }]);
  } finally { connection.close(); client.fail("closed"); }
});
