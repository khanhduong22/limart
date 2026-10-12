import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Checking and assigning PARTNER role to phuckhanh22...");

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { email: { contains: "phuckhanh22", mode: "insensitive" } },
        { name: { contains: "phuckhanh22", mode: "insensitive" } },
      ],
    },
  });

  if (users.length === 0) {
    console.log("No user found matching 'phuckhanh22' in database.");
    return;
  }

  for (const u of users) {
    console.log(`Found user: ${u.name} (${u.email}), current role: ${u.role}, staffTasksAllowed: ${u.staffTasksAllowed}`);
    const updated = await prisma.user.update({
      where: { id: u.id },
      data: { role: "PARTNER", staffTasksAllowed: true },
    });
    console.log(`Successfully updated ${updated.name} (${updated.email}) to role: ${updated.role} (staffTasksAllowed: ${updated.staffTasksAllowed}) 🚀`);
  }
}

main()
  .catch((err) => {
    console.error("Error updating user role:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
