import test from "node:test";
import assert from "node:assert/strict";
import { listProviders } from "../src/imageWorkflow.mjs";
import { planBrief } from "../src/plan.mjs";

// 图源存活核验 2026-07-08：
// - 泼辣有图(polayoutu.com) 302 跳转产品官网、别样网(bieyang.info) 域名待售 → 已关站，移除。
// - ssyer.com 实为「沙沙野」(此前被误标为别样网，已更名)，存活、有 ICP 备案、声明 CC0 1.0。
// - cc0.cn 降为人工浏览入口(manual:true)：聚合部分仅预览图、原图跳源站、「CC0」标签与源站协议可能不符、无 API → 不进程序化取图顺序。
// 程序化国内可直取 CC0 源：沙沙野(ssyer) + hippopx(备选)。
const DOMESTIC_PROGRAMMATIC = ["ssyer", "hippopx"];

test("程序化国内 CC0 源接入 PROVIDERS，Tier 1 CC0，标国内，带核验日期", () => {
  const ps = listProviders();
  for (const id of DOMESTIC_PROGRAMMATIC) {
    const p = ps.find(x => x.id === id);
    assert.ok(p, `缺国内源 ${id}`);
    assert.match(String(p.tier), /1|CC0/i, `${id} 应 Tier 1 CC0`);
    assert.match(String(p.note), /国内/, `${id} note 应标国内可访问`);
    assert.equal(p.verified, "2026-07-08", `${id} 应带核验日期字段`);
  }
});

test("已关站源不得留在 PROVIDERS（泼辣有图移除）", () => {
  const ids = new Set(listProviders().map(p => p.id));
  assert.ok(!ids.has("palayoutu"), "泼辣有图(polayoutu) 已停运，应从 PROVIDERS 移除");
});

test("ssyer 已更名为沙沙野，不得残留别样网误标", () => {
  const p = listProviders().find(x => x.id === "ssyer");
  assert.ok(p, "沙沙野(ssyer) 应保留");
  assert.match(String(p.label), /沙沙野/, "ssyer.com 实为沙沙野");
  assert.ok(!/别样/.test(String(p.label)) && !/别样/.test(String(p.note)), "不得再出现别样网误标");
});

test("cc0.cn 保留为人工浏览入口：manual:true，且不进程序化取图顺序", () => {
  const cc0 = listProviders().find(p => p.id === "cc0cn");
  assert.ok(cc0, "cc0cn 应保留为人工浏览入口");
  assert.equal(cc0.manual, true, "cc0cn 应标 manual:true");
});

test("cover providerOrder：国内 CC0(沙沙野) 前置于国际源；cc0.cn/泼辣不入序；国内位主力 Pexels/Pixabay 在序内", async () => {
  const b = await planBrief("examples/source-article.md", { kind: "diary", style: "sp-warm" });
  const order = b.cards[0].imageRequest.providerOrder;
  for (const id of DOMESTIC_PROGRAMMATIC) {
    assert.ok(order.includes(id), `providerOrder 应含 ${id}`);
  }
  assert.ok(order.indexOf("ssyer") < order.indexOf("unsplash"), "国内 CC0(沙沙野) 应前置于国际源");
  assert.ok(!order.includes("cc0cn"), "cc0.cn 为人工浏览入口，不入程序化顺序");
  assert.ok(!order.includes("palayoutu"), "泼辣有图已关站，不入顺序");
  assert.ok(order.includes("pexels") && order.includes("pixabay"), "国内位主力 Pexels/Pixabay 应在序内");
});
