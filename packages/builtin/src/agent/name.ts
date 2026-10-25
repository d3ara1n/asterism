import { randomInt } from "node:crypto";

const adjectives = [
  "Bold", "Brave", "Bright", "Calm", "Cheeky", "Clear", "Clever", "Cool",
  "Cozy", "Daring", "Deep", "Dirty", "Dizzy", "Dusty", "Fair", "Fleet",
  "Fresh", "Fuzzy", "Gentle", "Golden", "Grand", "Happy", "Hard", "Keen",
  "Kind", "Lazy", "Light", "Lively", "Loud", "Lucky", "Merry", "Misty",
  "Naughty", "Noble", "Quiet", "Rapid", "Rusty", "Shy", "Silly", "Silver",
  "Smooth", "Soft", "Steady", "Swift", "Warm", "Wet", "Wild", "Wise",
];

const nouns = [
  "Badger", "Bear", "Birch", "Blossom", "Breeze", "Brook", "Cedar", "Cloud",
  "Comet", "Crane", "Deer", "Dick", "Dolphin", "Dune", "Eagle", "Ember",
  "Falcon", "Fern", "Finch", "Fox", "Frog", "Grove", "Hawk", "Heron",
  "Hill", "Lake", "Leaf", "Lynx", "Maple", "Moon", "Moss", "Oak",
  "Otter", "Owl", "Panda", "Pearl", "Pine", "Pussy", "Raven", "Reed",
  "River", "Seal", "Sparrow", "Star", "Stone", "Tiger", "Willow", "Wolf",
];

/** 创建时生成展示名称；资源身份由宿主管理，名称允许重复。 */
export function generateAgentName(): string {
  return adjectives[randomInt(adjectives.length)]! + nouns[randomInt(nouns.length)]!;
}
