import * as React from "react";
import { Button, Dialog, Flex, Text, TextField } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useRPC2Call } from "@/contexts/RPC2Context";

type SwitchResult = "queued" | "offline" | "unsupported" | "error";

/**
 * 手动触发 agent 更新（单个或批量），通过 admin:switchAgentVersionBatch 下发版本切换事件。
 */
export function UpdateAgentDialog({
  uuids,
  children,
}: {
  uuids: string[];
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { call } = useRPC2Call();
  const [open, setOpen] = React.useState(false);
  const [version, setVersion] = React.useState("latest");
  const [submitting, setSubmitting] = React.useState(false);

  const submit = async () => {
    const target = version.trim();
    if (!target) {
      toast.error(t("admin.agentUpdate.versionRequired"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await call<
        { uuids: string[]; version: string },
        { results: Record<string, SwitchResult> }
      >("admin:switchAgentVersionBatch", { uuids, version: target });
      const counts: Record<SwitchResult, number> = {
        queued: 0,
        offline: 0,
        unsupported: 0,
        error: 0,
      };
      Object.values(res?.results ?? {}).forEach((r) => {
        counts[r] = (counts[r] ?? 0) + 1;
      });
      const summary = t("admin.agentUpdate.result", counts);
      if (counts.queued > 0) {
        toast.success(summary);
        setOpen(false);
      } else {
        toast.error(summary);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger>{children}</Dialog.Trigger>
      <Dialog.Content maxWidth="460px">
        <Dialog.Title>{t("admin.agentUpdate.title")}</Dialog.Title>
        <Dialog.Description size="2" mb="3">
          {t("admin.agentUpdate.description", { count: uuids.length })}
        </Dialog.Description>
        <Flex direction="column" gap="2">
          <label className="text-sm font-bold">
            {t("admin.agentUpdate.version")}
          </label>
          <TextField.Root
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="latest"
          />
          <Text size="1" color="gray">
            {t("admin.agentUpdate.versionHint")}
          </Text>
        </Flex>
        <Flex justify="end" gap="2" mt="4">
          <Dialog.Close>
            <Button variant="soft" color="gray">
              {t("common.cancel")}
            </Button>
          </Dialog.Close>
          <Button onClick={submit} disabled={submitting || uuids.length === 0}>
            {t("admin.agentUpdate.submit")}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
