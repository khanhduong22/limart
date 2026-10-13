import { prisma } from "../packages/db/src";

async function main() {
  const adjustments = await prisma.payrollAdjustment.findMany({
    where: {
      reason: {
        contains: "(Ref: ",
      },
    },
  });

  console.log(`Found ${adjustments.length} adjustments with Ref ID.`);

  let updated = 0;
  for (const adj of adjustments) {
    const match = adj.reason.match(/\(Ref:\s*([^)]+)\)/);
    if (!match) continue;
    const taskId = match[1];

    const task = await prisma.userTask.findUnique({
      where: { id: taskId },
      include: { taskDefinition: true, taskItem: true },
    });

    if (task) {
      const taskName = task.taskItem?.title || task.taskDefinition?.name || "Unknown Task";
      const noteSuffix = task.note ? ` (${task.note})` : "";
      const quantity = task.quantity || 1;
      
      const newReason = `Task: ${taskName} - ${quantity}x${noteSuffix}`;
      
      await prisma.payrollAdjustment.update({
        where: { id: adj.id },
        data: { reason: newReason },
      });
      updated++;
      console.log(`Updated ID ${adj.id} -> ${newReason}`);
    }
  }

  console.log(`Successfully updated ${updated} records.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
