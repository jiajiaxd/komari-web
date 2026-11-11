import type { NodeDetail } from "@/contexts/NodeDetailsContext";
import { IconButton } from "@radix-ui/themes";
import { CloudDownload, Terminal } from "lucide-react";
import { UpdateAgentDialog } from "@/components/admin/UpdateAgentDialog";
import { useTranslation } from "react-i18next";
import DeleteButton from "./DeleteButton";
import GenerateCommandButton from "./GenerateCommandButton";
import EditButton from "./EditButton";
import BillingButton from "./BillingButton";

const ActionButtons = ({
  node,
  settings,
  isSnapshotBackend,
}: {
  node: NodeDetail;
  settings: any;
  isSnapshotBackend: boolean;
}) => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-4">
      <GenerateCommandButton
        node={node}
        settings={settings}
        isSnapshotBackend={isSnapshotBackend}
      />
      <IconButton
        title={t("terminal.title")}
        variant="ghost"
        onClick={() => {
          window.open(`/terminal?uuid=${node.uuid}`, "_blank");
        }}
      >
        <Terminal size="18" />
      </IconButton>
      <UpdateAgentDialog uuids={[node.uuid]}>
        <IconButton title={t("admin.agentUpdate.title")} variant="ghost">
          <CloudDownload size={18} />
        </IconButton>
      </UpdateAgentDialog>
      <EditButton node={node} />
      <BillingButton node={node} />
      <DeleteButton node={node} />
    </div>
  );
};

export default ActionButtons;
