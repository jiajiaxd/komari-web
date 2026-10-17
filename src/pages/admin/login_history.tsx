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
  Dialog,
  Flex,
  Select,
  Switch,
  Tabs,
  Text,
  TextField,
} from "@radix-ui/themes";
import { RefreshCw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import NumberPicker from "@/components/ui/number-picker";
import Loading from "@/components/loading";
import Flag from "@/components/Flag";
import { updateSettingsWithToast, useSettings } from "@/lib/api";
import {
  SettingCard,
  SettingCardLabel,
  SettingCardLongTextInput,
  SettingCardShortTextInput,
  SettingCardSwitch,
} from "@/components/admin/SettingCard";
import {
  CN_PROVINCES,
  CN_SPECIAL_REGIONS,
  US_STATES,
  parseRegionList,
  regionLabel,
  type RegionOption,
} from "@/config/loginRegions";

interface LoginRecord {
  id: number;
  client_uuid: string;
  client_name: string;
  protocol: string;
  username: string;
  source_ip: string;
  source_port: number;
  auth_method: string;
  country: string;
  country_code: string;
  region: string;
  region_code: string;
  city: string;
  isp: string;
  trusted: boolean;
  trust_reason: string;
  alerted: boolean;
  login_time: string;
}

interface ClientInfo {
  uuid: string;
  name: string;
}

const ALL_CLIENTS = "__all__";

const LoginHistoryPage = () => {
  const { t } = useTranslation();
  return (
    <Flex direction="column" gap="4" className="km-page-admin-login-history p-4">
      <label className="text-2xl font-bold">{t("loginHistory.title")}</label>
      <Tabs.Root defaultValue="records">
        <Tabs.List>
          <Tabs.Trigger value="records">{t("loginHistory.records")}</Tabs.Trigger>
          <Tabs.Trigger value="settings">{t("loginHistory.settings")}</Tabs.Trigger>
        </Tabs.List>
        <Box pt="3">
          <Tabs.Content value="records">
            <RecordsView />
          </Tabs.Content>
          <Tabs.Content value="settings">
            <SettingsView />
          </Tabs.Content>
        </Box>
      </Tabs.Root>
    </Flex>
  );
};

function formatSource(r: LoginRecord) {
  if (!r.source_port) return r.source_ip;
  return r.source_ip.includes(":")
    ? `[${r.source_ip}]:${r.source_port}`
    : `${r.source_ip}:${r.source_port}`;
}

function formatLocation(r: LoginRecord) {
  const parts: string[] = [];
  [r.country, r.region, r.city].forEach((p) => {
    if (p && parts[parts.length - 1] !== p) parts.push(p);
  });
  return parts.join(" ");
}

const RecordsView = () => {
  const { t } = useTranslation();
  const [records, setRecords] = React.useState<LoginRecord[]>([]);
  const [clients, setClients] = React.useState<ClientInfo[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(20);
  const [total, setTotal] = React.useState(0);
  const [client, setClient] = React.useState(ALL_CLIENTS);
  const [untrustedOnly, setUntrustedOnly] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);
  const limitRef = React.useRef(limit);
  // NumberPicker 会在每次 onChange 变化时回调，需保持引用稳定并只在值变化时重置页码
  const handleLimitChange = React.useCallback((v: number) => {
    if (v === limitRef.current) return;
    limitRef.current = v;
    setLimit(v);
    setPage(1);
  }, []);

  React.useEffect(() => {
    fetch("/api/admin/client/list")
      .then((res) => (res.ok ? res.json() : []))
      .then((list: ClientInfo[]) => setClients(list ?? []))
      .catch(() => setClients([]));
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      limit: String(limit),
      page: String(page),
    });
    if (client !== ALL_CLIENTS) params.set("uuid", client);
    if (untrustedOnly) params.set("untrusted_only", "true");
    setLoading(true);
    fetch(`/api/admin/login-records?${params}`, { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || res.statusText);
        setRecords(data.data.records ?? []);
        setTotal(data.data.total ?? 0);
        setError(null);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, limit, client, untrustedOnly, reloadKey]);

  const clearRecords = async () => {
    try {
      const res = await fetch("/api/admin/login-records/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(client !== ALL_CLIENTS ? { uuid: client } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || res.statusText);
      toast.success(t("loginHistory.cleared", { count: data.data?.deleted ?? 0 }));
      setPage(1);
      setReloadKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const pageNumbers = buildPageNumbers(page, totalPages);

  return (
    <Flex direction="column" gap="3">
      <Flex gap="3" align="center" wrap="wrap" justify="between">
        <Flex gap="3" align="center" wrap="wrap">
          <Select.Root
            value={client}
            onValueChange={(v) => {
              setClient(v);
              setPage(1);
            }}
          >
            <Select.Trigger className="min-w-40" />
            <Select.Content>
              <Select.Item value={ALL_CLIENTS}>
                {t("loginHistory.allNodes")}
              </Select.Item>
              {clients.map((c) => (
                <Select.Item key={c.uuid} value={c.uuid}>
                  {c.name || c.uuid}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
          <Text as="label" size="2">
            <Flex gap="2" align="center">
              <Switch
                checked={untrustedOnly}
                onCheckedChange={(v) => {
                  setUntrustedOnly(v);
                  setPage(1);
                }}
              />
              {t("loginHistory.untrustedOnly")}
            </Flex>
          </Text>
        </Flex>
        <Flex gap="2" align="center">
          <NumberPicker
            defaultValue={limit}
            onChange={handleLimitChange}
            min={5}
            max={200}
          />
          <Button variant="soft" onClick={() => setReloadKey((k) => k + 1)}>
            <RefreshCw size={16} />
            {t("common.refresh")}
          </Button>
          <Dialog.Root>
            <Dialog.Trigger>
              <Button variant="soft" color="red">
                <Trash2 size={16} />
                {t("loginHistory.clear")}
              </Button>
            </Dialog.Trigger>
            <Dialog.Content maxWidth="420px">
              <Dialog.Title>{t("loginHistory.clear")}</Dialog.Title>
              <Dialog.Description size="2">
                {client === ALL_CLIENTS
                  ? t("loginHistory.clearAllConfirm")
                  : t("loginHistory.clearNodeConfirm")}
              </Dialog.Description>
              <Flex justify="end" gap="2" mt="4">
                <Dialog.Close>
                  <Button variant="soft" color="gray">
                    {t("common.cancel")}
                  </Button>
                </Dialog.Close>
                <Dialog.Close>
                  <Button color="red" onClick={clearRecords}>
                    {t("common.confirm")}
                  </Button>
                </Dialog.Close>
              </Flex>
            </Dialog.Content>
          </Dialog.Root>
        </Flex>
      </Flex>

      {error ? (
        <Text color="red">{error}</Text>
      ) : loading ? (
        <Loading />
      ) : (
        <div className="rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("loginHistory.time")}</TableHead>
                <TableHead>{t("loginHistory.node")}</TableHead>
                <TableHead>{t("loginHistory.protocol")}</TableHead>
                <TableHead>{t("loginHistory.user")}</TableHead>
                <TableHead>{t("loginHistory.source")}</TableHead>
                <TableHead>{t("loginHistory.location")}</TableHead>
                <TableHead>{t("loginHistory.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    {t("loginHistory.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                records.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">
                      {new Date(r.login_time).toLocaleString()}
                    </TableCell>
                    <TableCell>{r.client_name || r.client_uuid}</TableCell>
                    <TableCell>
                      <Badge color={r.protocol === "rdp" ? "blue" : "gray"}>
                        {r.protocol.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Flex direction="column">
                        <span>{r.username}</span>
                        {r.auth_method && (
                          <Text size="1" color="gray">
                            {r.auth_method}
                          </Text>
                        )}
                      </Flex>
                    </TableCell>
                    <TableCell className="font-mono whitespace-nowrap">
                      {formatSource(r)}
                    </TableCell>
                    <TableCell>
                      <Flex gap="2" align="center">
                        {r.country_code && <Flag flag={r.country_code} />}
                        <Flex direction="column">
                          <span>
                            {formatLocation(r) ||
                              (r.trust_reason === "private"
                                ? t("loginHistory.privateNetwork")
                                : t("common.unknown"))}
                          </span>
                          {r.isp && (
                            <Text size="1" color="gray">
                              {r.isp}
                            </Text>
                          )}
                        </Flex>
                      </Flex>
                    </TableCell>
                    <TableCell>
                      <Flex gap="1" wrap="wrap">
                        {r.trusted ? (
                          <Badge color="green">
                            {t(`loginHistory.reason.${r.trust_reason}`)}
                          </Badge>
                        ) : (
                          <Badge color="red">{t("loginHistory.untrusted")}</Badge>
                        )}
                        {r.alerted && (
                          <Badge color="orange">{t("loginHistory.alerted")}</Badge>
                        )}
                      </Flex>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Flex justify="center" align="center" gap="2" wrap="wrap">
        <Button
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          title={t("common.previous_page", "Previous page")}
          aria-label={t("common.previous_page", "Previous page")}
        >
          {"<"}
        </Button>
        {pageNumbers.map((p, i) =>
          typeof p === "number" ? (
            <Button
              key={i}
              variant={p === page ? "solid" : "soft"}
              onClick={() => setPage(p)}
            >
              {p}
            </Button>
          ) : (
            <span key={i} className="px-2">
              ...
            </span>
          )
        )}
        <Button
          disabled={page >= totalPages}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          title={t("common.next_page", "Next page")}
          aria-label={t("common.next_page", "Next page")}
        >
          {">"}
        </Button>
        <Text size="2" color="gray">
          {t("loginHistory.total", { count: total })}
        </Text>
      </Flex>
    </Flex>
  );
};

// 显示当前页及前后 1 页，两端省略号
function buildPageNumbers(page: number, totalPages: number): (number | string)[] {
  const result: (number | string)[] = [1];
  const left = Math.max(page - 1, 2);
  const right = Math.min(page + 1, totalPages - 1);
  if (left > 2) result.push("...");
  for (let i = left; i <= right; i++) result.push(i);
  if (right < totalPages - 1) result.push("...");
  if (totalPages > 1) result.push(totalPages);
  return result;
}

const SettingsView = () => {
  const { t } = useTranslation();
  const { settings, loading, error, refetch } = useSettings();

  if (loading) return <Loading />;
  if (error) return <Text color="red">{error}</Text>;

  const savePositiveInt = async (key: string, value: string) => {
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) {
      toast.error(t("loginHistory.positiveInteger"));
      return;
    }
    await updateSettingsWithToast({ [key]: n }, t);
  };

  return (
    <Flex direction="column" gap="3">
      <SettingCardLabel>{t("loginHistory.settingsMonitor")}</SettingCardLabel>
      <SettingCardSwitch
        title={t("loginHistory.enable")}
        description={t("loginHistory.enableDescription")}
        defaultChecked={settings.login_monitor_enabled ?? true}
        onChange={async (checked) => {
          await updateSettingsWithToast({ login_monitor_enabled: checked }, t);
        }}
      />
      <SettingCardSwitch
        title={t("loginHistory.alert")}
        description={t("loginHistory.alertDescription")}
        defaultChecked={settings.login_alert_enabled ?? true}
        onChange={async (checked) => {
          await updateSettingsWithToast({ login_alert_enabled: checked }, t);
        }}
      />

      <SettingCardLabel>{t("loginHistory.settingsTrust")}</SettingCardLabel>
      <RegionPicker
        value={settings.login_allowed_regions ?? ""}
        onSaved={refetch}
      />
      <SettingCardLongTextInput
        title={t("loginHistory.trustedIps")}
        description={t("loginHistory.trustedIpsDescription")}
        defaultValue={settings.login_trusted_ips ?? ""}
        OnSave={async (value) => {
          await updateSettingsWithToast({ login_trusted_ips: value.trim() }, t);
        }}
      />

      <SettingCardLabel>{t("loginHistory.settingsRetention")}</SettingCardLabel>
      <SettingCardShortTextInput
        type="number"
        title={t("loginHistory.retentionDays")}
        description={t("loginHistory.retentionDaysDescription")}
        defaultValue={settings.login_history_retention_days ?? 365}
        OnSave={(value) => savePositiveInt("login_history_retention_days", value)}
      />
      <SettingCardShortTextInput
        type="number"
        title={t("loginHistory.maxRecords")}
        description={t("loginHistory.maxRecordsDescription")}
        defaultValue={settings.login_history_max_records ?? 1000}
        OnSave={(value) => savePositiveInt("login_history_max_records", value)}
      />
    </Flex>
  );
};

const RegionPicker = ({
  value,
  onSaved,
}: {
  value: string;
  onSaved: () => void;
}) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || "zh";
  const current = parseRegionList(value);
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set(current));
  const [custom, setCustom] = React.useState("");

  const known = React.useMemo(
    () =>
      new Set(
        ["CN", "US", ...CN_PROVINCES, ...CN_SPECIAL_REGIONS, ...US_STATES].map(
          (r) => (typeof r === "string" ? r : r.code)
        )
      ),
    []
  );

  const openDialog = (o: boolean) => {
    if (o) {
      const list = parseRegionList(value);
      setSelected(new Set(list.filter((c) => known.has(c))));
      setCustom(list.filter((c) => !known.has(c)).join(", "));
    }
    setOpen(o);
  };

  const toggle = (code: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(code);
      else next.delete(code);
      return next;
    });
  };

  const save = async () => {
    const codes = [...selected, ...parseRegionList(custom)];
    const unique = Array.from(new Set(codes));
    await updateSettingsWithToast({ login_allowed_regions: unique.join(",") }, t);
    setOpen(false);
    onSaved();
  };

  const group = (title: string, country: string, options: RegionOption[]) => (
    <Flex direction="column" gap="2">
      <Flex justify="between" align="center">
        <Text weight="bold">{title}</Text>
        <Text as="label" size="2">
          <Flex gap="2" align="center">
            <Checkbox
              checked={selected.has(country)}
              onCheckedChange={(v) => toggle(country, Boolean(v))}
            />
            {t("loginHistory.wholeCountry")}
          </Flex>
        </Text>
      </Flex>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1">
        {options.map((o) => (
          <Text as="label" size="2" key={o.code}>
            <Flex gap="2" align="center">
              <Checkbox
                disabled={selected.has(country) && o.code.startsWith(country + "-")}
                checked={selected.has(o.code) || (selected.has(country) && o.code.startsWith(country + "-"))}
                onCheckedChange={(v) => toggle(o.code, Boolean(v))}
              />
              {lang.startsWith("zh") ? o.zh : o.en}
            </Flex>
          </Text>
        ))}
      </div>
    </Flex>
  );

  return (
    <SettingCard
      title={t("loginHistory.allowedRegions")}
      description={t("loginHistory.allowedRegionsDescription")}
    >
      <Flex gap="2" align="center" wrap="wrap">
        {current.length === 0 ? (
          <Text size="2" color="gray">
            {t("loginHistory.noRegions")}
          </Text>
        ) : (
          current.map((c) => (
            <Badge key={c} variant="soft">
              {c === "CN" || c === "US" ? c : regionLabel(c, lang)}
            </Badge>
          ))
        )}
        <Dialog.Root open={open} onOpenChange={openDialog}>
          <Dialog.Trigger>
            <Button variant="soft" size="1">
              {t("common.edit")}
            </Button>
          </Dialog.Trigger>
          <Dialog.Content maxWidth="760px">
            <Dialog.Title>{t("loginHistory.allowedRegions")}</Dialog.Title>
            <Flex direction="column" gap="4">
              {group(t("loginHistory.china"), "CN", [...CN_PROVINCES, ...CN_SPECIAL_REGIONS])}
              {group(t("loginHistory.unitedStates"), "US", US_STATES)}
              <Flex direction="column" gap="1">
                <Text weight="bold">{t("loginHistory.customRegions")}</Text>
                <TextField.Root
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  placeholder="JP, SG, DE-BE"
                />
                <Text size="1" color="gray">
                  {t("loginHistory.customRegionsHint")}
                </Text>
              </Flex>
            </Flex>
            <Flex justify="end" gap="2" mt="4">
              <Dialog.Close>
                <Button variant="soft" color="gray">
                  {t("common.cancel")}
                </Button>
              </Dialog.Close>
              <Button onClick={save}>{t("common.save")}</Button>
            </Flex>
          </Dialog.Content>
        </Dialog.Root>
      </Flex>
    </SettingCard>
  );
};

export default LoginHistoryPage;
