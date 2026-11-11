import assert from "node:assert/strict";

// Run against Vite. API and RPC traffic is mocked; no server SSH settings change.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}),
});
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:5173";
const mainKey = { type: "ssh-ed25519", key: "AAAA", comment: "original-main", fingerprint: "SHA256:main" };
const backupKey = { type: "ssh-ed25519", key: "BBBB", comment: "backup", fingerprint: "SHA256:backup" };
const clients = ["Empty", "Main", "Backup", "Unsupported"].map((name, i) => ({
  uuid: `node-${i}`, name, os: "Ubuntu", weight: i,
  cpu_cores: 2, mem_total: 4096, disk_total: 10240, swap_total: 0, tags: "",
  token: `test-token-${i}`, region: "SG", billing_cycle: 30, price: 0, currency: "$",
  expired_at: "", group: "", remark: "", public_remark: "", ipv4: "", ipv6: "",
}));
const states = clients.slice(0, 3).map((node, i) => ({
  uuid: node.uuid,
  state: {
    user: "root", authorized_keys_path: "/root/.ssh/authorized_keys",
    keys: i === 1 ? [mainKey] : i === 2 ? [backupKey] : [],
    config_path: "/etc/ssh/sshd_config", ports: [22],
    permit_root_login: "yes", password_authentication: true, root_password_login: true,
  },
  state_at: new Date().toISOString(), checked_at: new Date().toISOString(),
}));
const writes = [];
const errors = [];
let twoFaEnabled = true;

function rpc(request) {
  let result = {};
  if (request.method === "admin:getSSHStates") result = { states, remarks: { "SHA256:main": "Main key" } };
  else if (request.method === "admin:applySSHChanges") {
    writes.push(request.params);
    result = { results: request.params.uuids.map((uuid) => ({ uuid, status: "ok" })) };
  } else if (request.method === "common:getNodes") result = Object.fromEntries(clients.map((c) => [c.uuid, c]));
  else if (request.method === "common:getVersion") result = { version: "snapshot", hash: "test" };
  else if (request.method === "admin:listPlugins") result = [];
  return { jsonrpc: "2.0", id: request.id, result };
}

const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "zh-CN", serviceWorkers: "block" });
await context.addInitScript(() => localStorage.setItem("language", "zh-CN"));
await context.route("**/api/**", async (route) => {
  const path = new URL(route.request().url()).pathname;
  let body = { status: "success", data: [] };
  if (path === "/api/me") body = { logged_in: true, uuid: "admin", username: "admin", "2fa_enabled": twoFaEnabled };
  else if (path === "/api/public") body = { data: { theme: "default", sitename: "Komari", theme_settings: {
    _komari_onboarding_v1: { seen: ["install", "workbench", "notifications", "markets", "terminal"], workbenchOpened: true },
  } } };
  else if (path === "/api/admin/settings") body = { data: { eula_accepted: true } };
  else if (path === "/api/admin/client/list") body = clients;
  else if (path === "/api/admin/login-records") body = { data: { records: [], total: 0 } };
  else if (path === "/api/rpc2") body = rpc(route.request().postDataJSON());
  await route.fulfill({ json: body });
});
await context.routeWebSocket("**/api/**", (socket) => socket.onMessage((message) => socket.send(JSON.stringify(rpc(JSON.parse(message))))));
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.on("pageerror", (error) => errors.push(error.message));
const dialog = page.getByRole("dialog");
const apply = () => dialog.getByRole("button", { name: /^应用到/ });
const otp = () => dialog.locator('input[name="2fa_code"]');
const row = (name) => page.locator(".km-page-admin-ssh tbody tr").filter({ has: page.getByText(name, { exact: true }) });
const known = (name) => dialog.locator("label").filter({ hasText: name }).getByRole("checkbox");
async function closeResults() {
  await dialog.getByRole("heading", { name: "执行结果" }).waitFor();
  await dialog.getByRole("button", { name: "关闭", exact: true }).click();
}

try {
  await page.goto(`${base}/admin/ssh`);
  await row("Empty").getByRole("button", { name: "下发公钥" }).click();
  await otp().waitFor();
  assert.equal(await row("Unsupported").getByRole("button", { name: "下发公钥" }).count(), 0);
  await known("Main key").click();
  assert.equal(await dialog.getByRole("checkbox", { name: "选择 node-0", exact: true }).isChecked(), true);
  assert.equal(await dialog.getByRole("checkbox", { name: "选择 node-1", exact: true }).count(), 0, "already-installed nodes are hidden");
  assert.equal(await dialog.getByRole("checkbox", { name: "选择 node-2", exact: true }).isChecked(), false);
  await known("backup").click();
  const keys = dialog.getByRole("textbox", { name: /手动输入公钥/ });
  await keys.fill("ssh-ed25519 AAAA another-comment\nssh-ed25519 CCCC new-key");
  assert.equal(await dialog.getByText("共 3 个公钥", { exact: true }).count(), 1);

  await apply().click();
  assert.equal(await otp().evaluate((el) => el.validity.valueMissing), true);
  assert.equal(writes.length, 0, "missing OTP must not send a request");
  await otp().fill("12345");
  await apply().click();
  assert.equal(writes.length, 0, "incomplete OTP must not send a request");
  await otp().fill("abcdef");
  await apply().click();
  assert.equal(writes.length, 0, "non-numeric OTP must not send a request");

  // Simulate a password manager changing only the DOM, without React events.
  await otp().evaluate((el) => { el.value = "012345"; });
  await keys.fill("ssh-ed25519 AAAA another-comment\nssh-ed25519 CCCC new-key\n# rerender");
  assert.equal(await otp().inputValue(), "012345", "autofill survives unrelated React renders");
  await otp().press("Enter");
  await closeResults();
  assert.deepEqual({ ...writes[0], add_keys: [...writes[0].add_keys].sort() }, {
    uuids: ["node-0"],
    add_keys: ["ssh-ed25519 AAAA another-comment", "ssh-ed25519 BBBB backup", "ssh-ed25519 CCCC new-key"],
    "2fa_code": "012345",
  });

  // Batch selection and known-key deselection retain the chosen servers.
  await row("Empty").getByRole("checkbox").click();
  await row("Backup").getByRole("checkbox").click();
  await page.locator(".km-page-admin-ssh").getByRole("button", { name: "下发公钥", exact: true }).first().click();
  await known("Main key").click();
  await known("backup").click();
  await known("backup").click();
  assert.equal(await dialog.getByRole("checkbox", { name: "选择 node-0", exact: true }).isChecked(), true);
  assert.equal(await dialog.getByRole("checkbox", { name: "选择 node-2", exact: true }).isChecked(), true);
  await otp().fill("654321");
  await apply().click();
  await closeResults();
  assert.deepEqual(writes[1], { uuids: ["node-0", "node-2"], add_keys: ["ssh-ed25519 AAAA original-main"], "2fa_code": "654321" });

  // Keep the existing by-key deployment entry working.
  await page.getByRole("tab", { name: "按公钥", exact: true }).click();
  await row("Main key").getByRole("button", { name: "下发到其他节点" }).click();
  assert.equal(await dialog.getByRole("textbox", { name: /手动输入公钥/ }).inputValue(), "ssh-ed25519 AAAA original-main");
  assert.equal(await apply().innerText(), "应用到 2 个节点");
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  assert.equal(writes.length, 2, "cancel must not submit");

  // The shared form still supports port changes when 2FA is disabled.
  twoFaEnabled = false;
  await page.locator(".km-page-admin-ssh").getByRole("button", { name: "SSH 端口", exact: true }).click();
  await dialog.getByPlaceholder("22", { exact: true }).fill("2222");
  assert.equal(await otp().count(), 0);
  await apply().click();
  await closeResults();
  assert.deepEqual(writes[2], { uuids: ["node-0", "node-2"], port: 2222 });

  // Exercise client-side navigation and fork features moved by the upstream refactor.
  await page.locator('a[href="/admin/servers"]').click();
  const servers = page.locator(".km-page-admin-index");
  const serverRow = servers.locator("tbody tr").filter({ has: page.getByText("Empty", { exact: true }) });
  await serverRow.getByRole("button", { name: "更新 Agent", exact: true }).click();
  await dialog.getByRole("heading", { name: "更新 Agent", exact: true }).waitFor();
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await serverRow.getByRole("checkbox").click();
  await servers.getByRole("button", { name: "批量更新 Agent", exact: true }).click();
  await dialog.getByRole("heading", { name: "更新 Agent", exact: true }).waitFor();
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await serverRow.getByRole("button", { name: "一键部署指令", exact: true }).click();
  await dialog.getByText("禁用登录监控", { exact: true }).click();
  const command = await dialog.locator("textarea").inputValue();
  assert.match(command, /--disable-login-monitor/);
  assert.match(command, /jiajiaxd\/komari-agent/);
  await page.keyboard.press("Escape");
  await servers.getByPlaceholder("查找服务器").fill("Backup");
  await servers.locator("tbody tr").filter({ has: page.getByText("Backup", { exact: true }) }).waitFor();
  await page.waitForFunction(() => document.querySelectorAll(".km-page-admin-index tbody tr").length === 1);
  await page.locator('a[href="/admin/login-history"]').click();
  await page.locator(".km-page-admin-login-history").waitFor();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator('a[href="/admin/ssh"]').click();
  await row("Empty").getByRole("button", { name: "下发公钥" }).waitFor();
  assert.deepEqual(errors, []);
  console.log("SSH management: per-server/batch deployment, known-key selection, deduplication, OTP autofill/validation/Enter, cancellation, by-key deployment and port changes passed. Refactored navigation, server filtering, Agent updates, login-monitor install options and fork install sources passed.");
} catch (error) {
  console.error("Page errors:", errors);
  console.error("Page content:", (await page.locator("body").innerText()).slice(0, 4000));
  const stack = page.locator(".km-error-boundary pre");
  if (await stack.count()) console.error("React error:", await stack.textContent());
  throw error;
} finally {
  await browser.close();
}
