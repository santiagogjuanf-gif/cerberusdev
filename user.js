require("dotenv").config();

const bcrypt = require("bcrypt");
const { prisma } = require("./lib/prisma");

(async () => {
  const username = "admin";
  const plain = "AguaDeCoco";
  const passwordHash = await bcrypt.hash(plain, 10);

  await prisma.adminUser.create({
    data: {
      username,
      passwordHash,
      role: 'admin',
      isActive: true
    }
  });

  console.log("✅ Admin creado:", username);
  console.log("🔑 Password:", plain);
  process.exit(0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
