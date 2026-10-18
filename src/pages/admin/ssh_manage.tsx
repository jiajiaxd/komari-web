import React from "react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Badge,
  Box,
  Button,
  Checkbox,
  Code,
  Dialog,
  Flex,
  IconButton,
  SegmentedControl,
  Tabs,
  Text,
  TextArea,
  TextField,
  Tooltip,
} from "@radix-ui/themes";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  KeyRound,
  Lock,
  Network,
  Plus,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import Loading from "@/components/loading";
import NodeSelector from "@/components/NodeSelector";
import { useRPC2Call } from "@/contexts/RPC2Context";
import {
  NodeDetailsProvider,
  useNodeDetails,
  type NodeDetail,
} from "@/contexts/NodeDetailsContext";

interface SSHKey {
  type: string;
  key: string;
  comment?: string;
  options?: string;
  fingerprint: string;
}

interface SSHState {
  user: string;
  authorized_keys_path: string;
  keys: SSHKey[];
  config_path: string;
  ports: number[];
  permit_root_login: string;
  password_authentication: boolean;
  root_password_login: boolean;
  service?: string;
}

interface SSHEntry {
  uuid: string;
  state: SSHState | null;
  state_at: string | null;
  error?: string;
  checked_at: string;
}

interface SSHCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

interface SSHResult {
  ok: boolean;
  error?: string;
  state?: SSHState;
  changed?: boolean;
  restarted?: boolean;
  rolled_back?: boolean;
  verified?: boolean;
  checks?: SSHCheck[];
}

type OutcomeStatus = "ok" | "failed" | "offline" | "unsupported" | "outdated" | "timeout";

interface Outcome {
  uuid: string;
  status: OutcomeStatus;
  error?: string;
  result?: SSHResult;
}

interface KeyGroup {
  fingerprint: string;
  type: string;
  key: string;
  comments: string[];
  uuids: string[];
}

type ApplyMode = "add" | "remove" | "port" | "root";

interface ApplyRequest {
  mode: ApplyMode;
  targets: string[];
  keys?: string;
  remove?: string[];
}

interface ApplyParams {
  uuids: string[];
  add_keys?: string[];
  remove_keys?: string[];
  port?: number;
  root_password_login?: boolean;
  "2fa_code"?: string;
}

const STATUS_COLORS: Record<OutcomeStatus, "green" | "red" | "gray" | "orange"> = {
  ok: "green",
  failed: "red",
  offline: "gray",
  unsupported: "gray",
  outdated: "orange",
  timeout: "orange",
};

const REFRESH_CONCURRENCY = 8;

// sshd -T prints the legacy alias of prohibit-password.
function permitRootLoginLabel(v: string) {
  return v === "without-password" ? "prohibit-password" : v;
}

function keyComment(k: { comment?: string; comments?: string[] }) {
  return k.comment ?? k.comments?.find(Boolean) ?? "";
}

const KeyName = ({ k }: { k: { comment?: string; comments?: string[] } }) => {
  const { t } = useTranslation();
  const comment = keyComment(k);
  return comment ? (
    <Text size="2" weight="medium" className="whitespace-nowrap">
      {comment}
    </Text>
  ) : (
    <Text size="2" color="gray" className="whitespace-nowrap">
      {t("sshManage.noComment")}
    </Text>
  );
};

function shortType(type: string) {
  return type
    .replace(/^ssh-/, "")
    .replace(/^ecdsa-sha2-/, "ecdsa-")
    .replace(/@openssh\.com$/, "");
}

function groupKeys(entries: Record<string, SSHEntry>, nodes: NodeDetail[]) {
  const groups = new Map<string, KeyGroup>();
  nodes.forEach((node) => {
    entries[node.uuid]?.state?.keys.forEach((k) => {
      let g = groups.get(k.fingerprint);
      if (!g) {
        g = { fingerprint: k.fingerprint, type: k.type, key: k.key, comments: [], uuids: [] };
        groups.set(k.fingerprint, g);
      }
      if (k.comment && !g.comments.includes(k.comment)) g.comments.push(k.comment);
      if (!g.uuids.includes(node.uuid)) g.uuids.push(node.uuid);
    });
  });
  return [...groups.values()].sort(
    (a, b) => b.uuids.length - a.uuids.length || keyComment(a).localeCompare(keyComment(b))
  );
}

function keyLine(g: KeyGroup) {
  const comment = g.comments[0];
  return comment ? `${g.type} ${g.key} ${comment}` : `${g.type} ${g.key}`;
}

const SSHManagePage = () => (
  <NodeDetailsProvider>
    <SSHManageContent />
  </NodeDetailsProvider>
);

const SSHManageContent = () => {
  const { t } = useTranslation();
  const { call } = useRPC2Call();
  const { nodeDetail, isLoading, error } = useNodeDetails();
  const [entries, setEntries] = React.useState<Record<string, SSHEntry>>({});
  const [outcomes, setOutcomes] = React.useState<Record<string, Outcome>>({});
  const [loaded, setLoaded] = React.useState(false);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [refreshing, setRefreshing] = React.useState<string[]>([]);
  const [request, setRequest] = React.useState<ApplyRequest | null>(null);
  const [results, setResults] = React.useState<Outcome[] | null>(null);

  const nodes = React.useMemo(
    () => [...nodeDetail].sort((a, b) => (a.weight ?? 0) - (b.weight ?? 0)),
    [nodeDetail]
  );
  const nodeName = React.useCallback(
    (uuid: string) => nodes.find((n) => n.uuid === uuid)?.name || uuid,
    [nodes]
  );
  const groups = React.useMemo(() => groupKeys(entries, nodes), [entries, nodes]);

  const load = React.useCallback(async () => {
    try {
      const res = await call<undefined, { states: SSHEntry[] }>("admin:getSSHStates");
      const map: Record<string, SSHEntry> = {};
      (res?.states ?? []).forEach((e) => (map[e.uuid] = e));
      setEntries(map);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoaded(true);
    }
  }, [call]);

  const rememberOutcomes = React.useCallback((list: Outcome[]) => {
    setOutcomes((prev) => {
      const next = { ...prev };
      list.forEach((o) => (next[o.uuid] = o));
      return next;
    });
  }, []);

  // Query nodes individually so that every row updates as soon as its agent
  // answers instead of waiting for the slowest one.
  const refresh = React.useCallback(
    async (uuids: string[]) => {
      if (uuids.length === 0) return;
      setRefreshing((prev) => [...new Set([...prev, ...uuids])]);
      const queue = [...uuids];
      const list: Outcome[] = [];
      const refreshOne = async (uuid: string) => {
        let outcome: Outcome;
        try {
          const res = await call<{ uuids: string[] }, { results: Outcome[] }>(
            "admin:refreshSSHStates",
            { uuids: [uuid] },
            { timeout: 30000 }
          );
          outcome = res?.results?.[0] ?? { uuid, status: "failed" };
        } catch (e) {
          outcome = { uuid, status: "failed", error: e instanceof Error ? e.message : String(e) };
        }
        list.push(outcome);
        rememberOutcomes([outcome]);
        const state = outcome.result?.state;
        if (state) {
          setEntries((prev) => ({
            ...prev,
            [uuid]: { ...prev[uuid], uuid, state, state_at: new Date().toISOString(), error: "" },
          }));
        }
        setRefreshing((prev) => prev.filter((u) => u !== uuid));
      };
      const worker = async () => {
        for (let uuid = queue.shift(); uuid; uuid = queue.shift()) {
          await refreshOne(uuid);
        }
      };
      await Promise.all(Array.from({ length: Math.min(REFRESH_CONCURRENCY, uuids.length) }, worker));
      const ok = list.filter((o) => o.status === "ok").length;
      const summary = t("sshManage.refreshResult", { ok, failed: list.length - ok });
      if (ok === list.length) toast.success(summary);
      else toast.warning(summary);
      await load();
    },
    [call, load, rememberOutcomes, t]
  );

  const initialized = React.useRef(false);
  React.useEffect(() => {
    if (isLoading || initialized.current) return;
    initialized.current = true;
    load();
  }, [isLoading, load]);

  const onApplied = (list: Outcome[]) => {
    rememberOutcomes(list);
    setRequest(null);
    setResults(list);
    load();
  };

  if (isLoading || !loaded) return <Loading />;
  if (error) return <Text color="red">{error}</Text>;

  const openDialog = (mode: ApplyMode) => setRequest({ mode, targets: selected });

  return (
    <Flex direction="column" gap="4" className="km-page-admin-ssh p-4">
      <Flex direction="column" gap="1">
        <label className="text-2xl font-bold">{t("sshManage.title")}</label>
        <Text size="2" color="gray">
          {t("sshManage.description")}
        </Text>
      </Flex>

      <Flex gap="2" wrap="wrap" align="center" justify="between">
        <Flex gap="2" wrap="wrap">
          <Button onClick={() => openDialog("add")}>
            <Plus size={16} />
            {t("sshManage.addKeys")}
          </Button>
          <Button variant="soft" color="red" onClick={() => openDialog("remove")}>
            <Trash2 size={16} />
            {t("sshManage.removeKeys")}
          </Button>
          <Button variant="soft" onClick={() => openDialog("port")}>
            <Network size={16} />
            {t("sshManage.changePort")}
          </Button>
          <Button variant="soft" onClick={() => openDialog("root")}>
            <Lock size={16} />
            {t("sshManage.rootPasswordLogin")}
          </Button>
        </Flex>
        <Flex gap="2" align="center">
          {selected.length > 0 && (
            <Text size="2" color="gray">
              {t("sshManage.selectedCount", { count: selected.length })}
            </Text>
          )}
          <Button
            variant="soft"
            disabled={refreshing.length > 0}
            onClick={() => refresh(selected.length > 0 ? selected : nodes.map((n) => n.uuid))}
          >
            <RefreshCw size={16} className={refreshing.length > 0 ? "animate-spin" : ""} />
            {selected.length > 0 ? t("sshManage.refreshSelected") : t("sshManage.refreshAll")}
          </Button>
        </Flex>
      </Flex>

      <Tabs.Root defaultValue="servers">
        <Tabs.List>
          <Tabs.Trigger value="servers">{t("sshManage.byServer")}</Tabs.Trigger>
          <Tabs.Trigger value="keys">{t("sshManage.byKey")}</Tabs.Trigger>
        </Tabs.List>
        <Box pt="3">
          <Tabs.Content value="servers">
            <ServerView
              nodes={nodes}
              entries={entries}
              outcomes={outcomes}
              selected={selected}
              onSelect={setSelected}
              refreshing={refreshing}
              onRefresh={(uuid) => refresh([uuid])}
              onRemoveKey={(uuid, fp) => setRequest({ mode: "remove", targets: [uuid], remove: [fp] })}
            />
          </Tabs.Content>
          <Tabs.Content value="keys">
            <KeyView
              groups={groups}
              nodes={nodes}
              nodeName={nodeName}
              onDeploy={(g) =>
                setRequest({
                  mode: "add",
                  targets: nodes.map((n) => n.uuid).filter((u) => !g.uuids.includes(u)),
                  keys: keyLine(g),
                })
              }
              onRemove={(g) => setRequest({ mode: "remove", targets: g.uuids, remove: [g.fingerprint] })}
            />
          </Tabs.Content>
        </Box>
      </Tabs.Root>

      {request && (
        <ApplyDialog
          request={request}
          groups={groups}
          onClose={() => setRequest(null)}
          onApplied={onApplied}
        />
      )}
      {results && (
        <ResultsDialog results={results} nodeName={nodeName} onClose={() => setResults(null)} />
      )}
    </Flex>
  );
};

const StatusBadge = ({ status }: { status: OutcomeStatus }) => {
  const { t } = useTranslation();
  return <Badge color={STATUS_COLORS[status]}>{t(`sshManage.status.${status}`)}</Badge>;
};

const ServerView = ({
  nodes,
  entries,
  outcomes,
  selected,
  onSelect,
  refreshing,
  onRefresh,
  onRemoveKey,
}: {
  nodes: NodeDetail[];
  entries: Record<string, SSHEntry>;
  outcomes: Record<string, Outcome>;
  selected: string[];
  onSelect: (uuids: string[]) => void;
  refreshing: string[];
  onRefresh: (uuid: string) => void;
  onRemoveKey: (uuid: string, fingerprint: string) => void;
}) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = React.useState<string[]>([]);
  const allSelected = nodes.length > 0 && selected.length === nodes.length;
  const toggle = (uuid: string, on: boolean) =>
    onSelect(on ? [...selected, uuid] : selected.filter((u) => u !== uuid));

  return (
    <div className="rounded-lg overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">
              <Checkbox
                checked={allSelected ? true : selected.length > 0 ? "indeterminate" : false}
                onCheckedChange={(v) => onSelect(v === true ? nodes.map((n) => n.uuid) : [])}
              />
            </TableHead>
            <TableHead>{t("sshManage.node")}</TableHead>
            <TableHead>{t("sshManage.port")}</TableHead>
            <TableHead>{t("sshManage.rootPasswordLogin")}</TableHead>
            <TableHead>{t("sshManage.keys")}</TableHead>
            <TableHead>{t("sshManage.updatedAt")}</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {nodes.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="h-24 text-center">
                {t("sshManage.noNodes")}
              </TableCell>
            </TableRow>
          ) : (
            nodes.map((node) => {
              const entry = entries[node.uuid];
              const state = entry?.state;
              const outcome = outcomes[node.uuid];
              const problem =
                outcome && outcome.status !== "ok" ? outcome.error || outcome.status : entry?.error;
              const open = expanded.includes(node.uuid);
              const busy = refreshing.includes(node.uuid);
              return (
                <React.Fragment key={node.uuid}>
                  <TableRow>
                    <TableCell>
                      <Checkbox
                        checked={selected.includes(node.uuid)}
                        onCheckedChange={(v) => toggle(node.uuid, v === true)}
                      />
                    </TableCell>
                    <TableCell>
                      <Flex direction="column" gap="1">
                        <span>{node.name || node.uuid}</span>
                        {problem && (
                          <Flex gap="1" align="center" className="max-w-80">
                            {outcome && outcome.status !== "ok" && <StatusBadge status={outcome.status} />}
                            <Text size="1" color="red" className="break-all">
                              {problem}
                            </Text>
                          </Flex>
                        )}
                      </Flex>
                    </TableCell>
                    <TableCell className="font-mono">
                      {state ? state.ports.join(", ") || "-" : "-"}
                    </TableCell>
                    <TableCell>
                      {state ? (
                        <Flex direction="column" gap="1">
                          <Badge color={state.root_password_login ? "orange" : "green"} className="w-fit">
                            {state.root_password_login ? t("sshManage.allowed") : t("sshManage.forbidden")}
                          </Badge>
                          <Text size="1" color="gray" className="font-mono">
                            PermitRootLogin {permitRootLoginLabel(state.permit_root_login)}
                            {" · "}
                            PasswordAuthentication {state.password_authentication ? "yes" : "no"}
                          </Text>
                        </Flex>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>
                      {state ? (
                        <Button
                          size="1"
                          variant="ghost"
                          onClick={() =>
                            setExpanded(open ? expanded.filter((u) => u !== node.uuid) : [...expanded, node.uuid])
                          }
                        >
                          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          {t("sshManage.keyCount", { count: state.keys.length })}
                        </Button>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {entry?.state_at ? (
                        new Date(entry.state_at).toLocaleString()
                      ) : (
                        <Text color="gray">{t("sshManage.neverRead")}</Text>
                      )}
                    </TableCell>
                    <TableCell>
                      <Tooltip content={t("common.refresh")}>
                        <IconButton size="1" variant="ghost" disabled={busy} onClick={() => onRefresh(node.uuid)}>
                          <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                  {open && state && (
                    <TableRow>
                      <TableCell />
                      <TableCell colSpan={6}>
                        <Flex direction="column" gap="2" py="1">
                          <Text size="1" color="gray" className="font-mono">
                            {state.authorized_keys_path}
                          </Text>
                          {state.keys.length === 0 ? (
                            <Text size="2" color="gray">
                              {t("sshManage.noKeys")}
                            </Text>
                          ) : (
                            state.keys.map((k) => (
                              <Flex key={k.fingerprint} gap="3" align="center" wrap="wrap">
                                <Badge variant="soft">{shortType(k.type)}</Badge>
                                <KeyName k={k} />
                                <Code size="1" variant="ghost" className="break-all">
                                  {k.fingerprint}
                                </Code>
                                {k.options && (
                                  <Tooltip content={k.options}>
                                    <Badge color="gray">{t("sshManage.hasOptions")}</Badge>
                                  </Tooltip>
                                )}
                                <IconButton
                                  size="1"
                                  variant="ghost"
                                  color="red"
                                  onClick={() => onRemoveKey(node.uuid, k.fingerprint)}
                                >
                                  <Trash2 size={14} />
                                </IconButton>
                              </Flex>
                            ))
                          )}
                        </Flex>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
};

const KeyView = ({
  groups,
  nodes,
  nodeName,
  onDeploy,
  onRemove,
}: {
  groups: KeyGroup[];
  nodes: NodeDetail[];
  nodeName: (uuid: string) => string;
  onDeploy: (g: KeyGroup) => void;
  onRemove: (g: KeyGroup) => void;
}) => {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("sshManage.key")}</TableHead>
            <TableHead>{t("sshManage.fingerprint")}</TableHead>
            <TableHead>{t("sshManage.installedOn")}</TableHead>
            <TableHead className="text-right">{t("common.action")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="h-24 text-center">
                {t("sshManage.noKeysAnywhere")}
              </TableCell>
            </TableRow>
          ) : (
            groups.map((g) => {
              const missing = nodes.length - g.uuids.length;
              return (
                <TableRow key={g.fingerprint}>
                  <TableCell>
                    <Flex gap="2" align="center">
                      <KeyRound size={16} className="shrink-0" />
                      <Flex direction="column">
                        <KeyName k={g} />
                        <Text size="1" color="gray">
                          {shortType(g.type)}
                          {g.comments.length > 1 && ` · ${g.comments.slice(1).join(", ")}`}
                        </Text>
                      </Flex>
                    </Flex>
                  </TableCell>
                  <TableCell>
                    <Code size="1" variant="ghost" className="break-all">
                      {g.fingerprint}
                    </Code>
                  </TableCell>
                  <TableCell>
                    <Flex direction="column" gap="1">
                      <Text size="2">
                        {t("sshManage.serverCount", { count: g.uuids.length, total: nodes.length })}
                      </Text>
                      <Flex gap="1" wrap="wrap">
                        {g.uuids.slice(0, 6).map((u) => (
                          <Badge key={u} variant="soft" color="gray">
                            {nodeName(u)}
                          </Badge>
                        ))}
                        {g.uuids.length > 6 && (
                          <Tooltip content={g.uuids.slice(6).map(nodeName).join(", ")}>
                            <Badge variant="soft" color="gray">
                              +{g.uuids.length - 6}
                            </Badge>
                          </Tooltip>
                        )}
                      </Flex>
                    </Flex>
                  </TableCell>
                  <TableCell>
                    <Flex gap="2" justify="end">
                      <Button size="1" variant="soft" disabled={missing === 0} onClick={() => onDeploy(g)}>
                        <Plus size={14} />
                        {t("sshManage.deployToOthers")}
                      </Button>
                      <Button size="1" variant="soft" color="red" onClick={() => onRemove(g)}>
                        <Trash2 size={14} />
                        {t("common.delete")}
                      </Button>
                    </Flex>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
};

const KEY_LINE = /^(ssh-(rsa|dss|ed25519|ed448)|ecdsa-sha2-nistp(256|384|521)|sk-(ssh-ed25519|ecdsa-sha2-nistp256)@openssh\.com)\s+[A-Za-z0-9+/]+={0,3}(\s+.*)?$/;

function parseKeyLines(text: string) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  return { lines, invalid: lines.filter((l) => !KEY_LINE.test(l)) };
}

const ApplyDialog = ({
  request,
  groups,
  onClose,
  onApplied,
}: {
  request: ApplyRequest;
  groups: KeyGroup[];
  onClose: () => void;
  onApplied: (results: Outcome[]) => void;
}) => {
  const { t } = useTranslation();
  const { call } = useRPC2Call();
  const { mode } = request;
  const [targets, setTargets] = React.useState<string[]>(request.targets);
  const [keysText, setKeysText] = React.useState(request.keys ?? "");
  const [remove, setRemove] = React.useState<string[]>(request.remove ?? []);
  const [port, setPort] = React.useState("");
  const [rootLogin, setRootLogin] = React.useState<"allow" | "forbid">("forbid");
  const [twoFaEnabled, setTwoFaEnabled] = React.useState(false);
  const [twoFaCode, setTwoFaCode] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/me")
      .then((res) => res.json())
      .then((data) => setTwoFaEnabled(Boolean(data?.["2fa_enabled"])))
      .catch(() => setTwoFaEnabled(false));
  }, []);

  // Keys installed on any of the chosen servers, plus preselected ones.
  const removable = groups.filter(
    (g) => remove.includes(g.fingerprint) || g.uuids.some((u) => targets.includes(u))
  );
  const parsed = parseKeyLines(keysText);
  const portNumber = Number(port);
  const portValid = Number.isInteger(portNumber) && portNumber >= 1 && portNumber <= 65535;

  let valid = targets.length > 0 && (!twoFaEnabled || twoFaCode.trim() !== "");
  if (mode === "add") valid &&= parsed.lines.length > 0 && parsed.invalid.length === 0;
  if (mode === "remove") valid &&= remove.length > 0;
  if (mode === "port") valid &&= portValid;

  const submit = async () => {
    const params: ApplyParams = { uuids: targets };
    if (mode === "add") params.add_keys = parsed.lines;
    if (mode === "remove") params.remove_keys = remove;
    if (mode === "port") params.port = portNumber;
    if (mode === "root") params.root_password_login = rootLogin === "allow";
    if (twoFaEnabled) params["2fa_code"] = twoFaCode.trim();
    setSubmitting(true);
    try {
      const res = await call<ApplyParams, { results: Outcome[] }>("admin:applySSHChanges", params, {
        timeout: 200000,
      });
      onApplied(res?.results ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && !submitting && onClose()}>
      <Dialog.Content maxWidth="640px">
        <Dialog.Title>{t(`sshManage.dialog.${mode}.title`)}</Dialog.Title>
        <Dialog.Description size="2" mb="3">
          {t(`sshManage.dialog.${mode}.description`)}
        </Dialog.Description>

        <Flex direction="column" gap="3">
          {mode === "add" && (
            <Flex direction="column" gap="1">
              <label className="text-sm font-bold">{t("sshManage.dialog.add.keys")}</label>
              <TextArea
                rows={5}
                spellCheck={false}
                className="font-mono"
                value={keysText}
                onChange={(e) => setKeysText(e.target.value)}
                placeholder="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA... user@host"
              />
              {parsed.invalid.length > 0 ? (
                <Text size="1" color="red" className="break-all">
                  {t("sshManage.dialog.add.invalid", { line: parsed.invalid[0].slice(0, 60) })}
                </Text>
              ) : (
                <Text size="1" color="gray">
                  {t("sshManage.dialog.add.hint", { count: parsed.lines.length })}
                </Text>
              )}
            </Flex>
          )}

          {mode === "remove" && (
            <Flex direction="column" gap="1">
              <label className="text-sm font-bold">{t("sshManage.dialog.remove.keys")}</label>
              {removable.length === 0 ? (
                <Text size="2" color="gray">
                  {t("sshManage.dialog.remove.none")}
                </Text>
              ) : (
                <Flex direction="column" gap="2" className="max-h-56 overflow-y-auto">
                  {removable.map((g) => (
                    <Text as="label" size="2" key={g.fingerprint}>
                      <Flex gap="2" align="center">
                        <Checkbox
                          checked={remove.includes(g.fingerprint)}
                          onCheckedChange={(v) =>
                            setRemove(
                              v === true
                                ? [...remove, g.fingerprint]
                                : remove.filter((f) => f !== g.fingerprint)
                            )
                          }
                        />
                        <Badge variant="soft">{shortType(g.type)}</Badge>
                        <KeyName k={g} />
                        <Code size="1" variant="ghost" className="break-all">
                          {g.fingerprint}
                        </Code>
                      </Flex>
                    </Text>
                  ))}
                </Flex>
              )}
              <Text size="1" color="orange">
                {t("sshManage.dialog.remove.warning")}
              </Text>
            </Flex>
          )}

          {mode === "port" && (
            <Flex direction="column" gap="1">
              <label className="text-sm font-bold">{t("sshManage.port")}</label>
              <TextField.Root
                type="number"
                min={1}
                max={65535}
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="22"
              />
              <Text size="1" color="orange">
                {t("sshManage.dialog.port.warning")}
              </Text>
            </Flex>
          )}

          {mode === "root" && (
            <Flex direction="column" gap="2">
              <SegmentedControl.Root
                value={rootLogin}
                onValueChange={(v) => setRootLogin(v as "allow" | "forbid")}
              >
                <SegmentedControl.Item value="forbid">{t("sshManage.forbid")}</SegmentedControl.Item>
                <SegmentedControl.Item value="allow">{t("sshManage.allow")}</SegmentedControl.Item>
              </SegmentedControl.Root>
              <Text size="1" color="gray">
                {rootLogin === "allow"
                  ? t("sshManage.dialog.root.allowHint")
                  : t("sshManage.dialog.root.forbidHint")}
              </Text>
            </Flex>
          )}

          <Flex direction="column" gap="1">
            <label className="text-sm font-bold">{t("sshManage.targets")}</label>
            <NodeSelector value={targets} onChange={setTargets} hiddenDescription />
          </Flex>

          <Text size="1" color="gray">
            {t("sshManage.dialog.restartNote")}
          </Text>
        </Flex>

        <Flex justify="end" gap="2" mt="4" align="center">
          {twoFaEnabled && (
            <TextField.Root
              className="w-32"
              type="number"
              placeholder="2FA"
              value={twoFaCode}
              onChange={(e) => setTwoFaCode(e.target.value)}
            />
          )}
          <Button variant="soft" color="gray" disabled={submitting} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            color={mode === "remove" ? "red" : undefined}
            disabled={!valid || submitting}
            onClick={submit}
          >
            {submitting && <RefreshCw size={14} className="animate-spin" />}
            {submitting
              ? t("sshManage.applying")
              : t("sshManage.applyTo", { count: targets.length })}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
};

const ResultsDialog = ({
  results,
  nodeName,
  onClose,
}: {
  results: Outcome[];
  nodeName: (uuid: string) => string;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const ok = results.filter((r) => r.status === "ok").length;
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Content maxWidth="720px">
        <Dialog.Title>{t("sshManage.results.title")}</Dialog.Title>
        <Dialog.Description size="2" mb="3">
          {t("sshManage.results.summary", { ok, failed: results.length - ok })}
        </Dialog.Description>
        <Flex direction="column" gap="3" className="max-h-[60vh] overflow-y-auto">
          {results.map((r) => (
            <Flex key={r.uuid} direction="column" gap="1" className="rounded-md border p-3">
              <Flex gap="2" align="center" wrap="wrap">
                <Text weight="bold">{nodeName(r.uuid)}</Text>
                <StatusBadge status={r.status} />
                {r.result?.restarted && <Badge color="blue">{t("sshManage.results.restarted")}</Badge>}
                {r.result?.rolled_back && <Badge color="orange">{t("sshManage.results.rolledBack")}</Badge>}
                {r.result && !r.result.changed && r.status === "ok" && (
                  <Badge color="gray">{t("sshManage.results.unchanged")}</Badge>
                )}
              </Flex>
              {r.error && (
                <Text size="1" color="red" className="break-all">
                  {r.error}
                </Text>
              )}
              {r.result?.checks && r.result.checks.length > 0 && (
                <Flex gap="3" wrap="wrap">
                  {r.result.checks.map((c) => (
                    <Tooltip key={c.name} content={c.detail || t(`sshManage.checks.${c.name}`)}>
                      <Flex gap="1" align="center">
                        {c.ok ? (
                          <CheckCircle2 size={14} className="text-green-600" />
                        ) : (
                          <XCircle size={14} className="text-red-600" />
                        )}
                        <Text size="1">{t(`sshManage.checks.${c.name}`)}</Text>
                      </Flex>
                    </Tooltip>
                  ))}
                </Flex>
              )}
            </Flex>
          ))}
        </Flex>
        <Flex justify="end" mt="4">
          <Button onClick={onClose}>{t("common.close")}</Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
};

export default SSHManagePage;
