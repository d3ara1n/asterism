import { createElement, useState } from "react";
import { defineRendererPlugin, useRendererCalls, useRendererConfiguration, useRendererSettings } from "@asterism/sdk/renderer";
import type { PluginCalls, ResourceRef } from "@asterism/sdk/contracts";
import { ReadLabel, Settings, settingsPlugin } from "../examples/settings-contract.ts";
import { ReadState } from "../examples/plugin-calls.ts";

/** Object and plugin scope type constraints match backend validation. */
export function invalidCalls(calls: PluginCalls, object: ResourceRef) {
  // @ts-expect-error Plugin-level calls cannot fabricate an associated object.
  void calls.invoke(ReadLabel, null, { object });
  // @ts-expect-error Object-level calls must provide an associated object.
  void calls.invoke(ReadState, null, {});
}
