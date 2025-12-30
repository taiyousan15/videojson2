import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Create test admin user
  const hashedPassword = await bcrypt.hash("password123", 12);

  const adminUser = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      email: "admin@example.com",
      name: "Admin User",
      password: hashedPassword,
      role: "ADMIN",
    },
  });

  console.log("Created admin user:", adminUser.email);

  // Create test editor user
  const editorUser = await prisma.user.upsert({
    where: { email: "editor@example.com" },
    update: {},
    create: {
      email: "editor@example.com",
      name: "Editor User",
      password: hashedPassword,
      role: "EDITOR",
    },
  });

  console.log("Created editor user:", editorUser.email);

  // Create test creator user
  const creatorUser = await prisma.user.upsert({
    where: { email: "creator@example.com" },
    update: {},
    create: {
      email: "creator@example.com",
      name: "Creator User",
      password: hashedPassword,
      role: "CREATOR",
    },
  });

  console.log("Created creator user:", creatorUser.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
