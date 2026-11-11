import { expect, it } from "vitest";
import { InspectorRequests } from "./inspector.ts";

it("matches overlapping inspector replies by request identity, not arrival order", async () => {
  const sent: { id: number }[] = [];
  const requests = new InspectorRequests(message => sent.push(JSON.parse(message)));
  const heap = requests.post("Runtime.getHeapUsage"), process = requests.post("Runtime.evaluate");
  requests.receive(JSON.stringify({ id: sent[1]!.id, result: { pid: 42 } }));
  requests.receive(JSON.stringify({ id: sent[0]!.id, result: { usedSize: 123 } }));
  expect(await heap).toEqual({ usedSize: 123 });
  expect(await process).toEqual({ pid: 42 });
});

it("rejects only the failed protocol operation while another request can still complete", async () => {
  const sent: { id: number }[] = [];
  const requests = new InspectorRequests(message => sent.push(JSON.parse(message)));
  const snapshot = requests.post("HeapProfiler.takeHeapSnapshot"), heap = requests.post("Runtime.getHeapUsage");
  const failed = expect(snapshot).rejects.toThrow("Inspector error -32000: Snapshot failed");
  requests.receive(JSON.stringify({ id: sent[0]!.id, error: { code: -32000, message: "Snapshot failed" } }));
  requests.receive(JSON.stringify({ id: sent[1]!.id, result: { usedSize: 456 } }));
  await failed;
  expect(await heap).toEqual({ usedSize: 456 });
});

it("rejects all pending requests and subsequent calls after disconnect", async () => {
  const requests = new InspectorRequests(() => {});
  const first = expect(requests.post("Runtime.getHeapUsage")).rejects.toThrow("Disconnected");
  const second = expect(requests.post("HeapProfiler.getSamplingProfile")).rejects.toThrow("Disconnected");
  requests.end(new Error("Disconnected"));
  await Promise.all([first, second]);
  await expect(requests.post("Runtime.evaluate")).rejects.toThrow("Disconnected");
});

it("surfaces a synchronous transport send failure without poisoning later requests", async () => {
  let send = true;
  const requests = new InspectorRequests(() => { if (send) throw new Error("Send failed"); });
  await expect(requests.post("Runtime.evaluate")).rejects.toThrow("Send failed");
  send = false;
  const next = requests.post("Runtime.getHeapUsage");
  requests.receive(JSON.stringify({ id: 2, result: { usedSize: 789 } }));
  expect(await next).toEqual({ usedSize: 789 });
});
