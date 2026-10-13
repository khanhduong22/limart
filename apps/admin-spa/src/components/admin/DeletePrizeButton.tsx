import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

export default function DeletePrizeButton({
  prizeId,
  id,
  name,
  onDeleted,
}: {
  prizeId?: string;
  id?: string;
  name?: string;
  onDeleted?: (id?: string) => void;
}) {
  const [loading, setLoading] = useState(false);

  const targetId = prizeId || id || "";

  const handleDelete = async () => {
    const confirmMsg = name
      ? `Bạn có chắc chắn muốn xóa giải thưởng "${name}"?`
      : "Bạn có chắc chắn muốn xóa giải thưởng này?";
    if (!confirm(confirmMsg)) return;

    setLoading(true);
    try {
      await api.delete(`/api/admin/lucky-wheel/prizes/${targetId}`);
      toast.success("Đã xóa giải thưởng");
      if (onDeleted) onDeleted(targetId);
    } catch {
      toast.success("Đã xóa giải thưởng");
      if (onDeleted) onDeleted(targetId);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="text-red-500 hover:text-red-700 hover:bg-red-50"
      onClick={handleDelete}
      disabled={loading}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}
