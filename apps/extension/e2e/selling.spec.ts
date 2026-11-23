import { test, expect } from "@playwright/test";
import { fileURLToPath } from "url";

test("seller cards without item anchors are collected; only the fresh matching Envista is confirmed", async ({ page }) => {
  const selling = "https://www.facebook.com/marketplace/you/selling";
  await page.route(selling, route => route.fulfill({contentType:"text/html",body:`
    <main><h1>Vos annonces</h1><article role="article"><span>2024 Buick Envista Avenir</span>
    <p>26 495 $CA</p><p>Publié il y a quelques secondes</p><a href="/marketplace/edit?listing_id=123">Modifier</a></article>
    <article role="article"><span>2025 Buick Envista Sport</span><p>26 495 $CA</p></article></main>
    <script type="application/json">{"listing":{"id":"456","marketplace_listing_title":"2025 Buick Envista Sport"}}</script>`}));
  await page.goto(selling);
  await page.evaluate(() => {
    const at = Date.now();
    sessionStorage.setItem("suivia-publish-intent",JSON.stringify({key:"buick:"+at,at}));
    Object.assign(window, { chrome: {
      storage: {local:{ get: (_: unknown, cb: (value: unknown) => void) => cb({
        pendingRelier:true, pendingPublication:{startedAt:at,vehicle:{id:"buick",year:2024,make:"Buick",model:"Envista"}}}), remove:()=>{} }},
      runtime:{onMessage:{addListener:()=>{}},sendMessage:(msg:{type:string;externalId?:string;listings?:{externalId:string}[]},cb:(r:unknown)=>void)=>{
        if(msg.type==="LISTING_CONFIRMED") document.body.dataset.confirmed=msg.externalId;
        if(msg.type==="LINK_LISTINGS") document.body.dataset.scan=msg.listings?.map(row=>row.externalId).sort().join(",");
        cb({success:true});
      }}
    }});
  });
  await page.addScriptTag({path:fileURLToPath(new URL("../dist/content.js",import.meta.url))});
  await expect(page.locator("body")).toHaveAttribute("data-confirmed","123");
  await expect(page.locator("body")).toHaveAttribute("data-scan","123,456");
});
