require("dotenv").config();

const bcrypt = require("bcrypt");
const db = require("./config/db");

(async () => {
  const username = "admin";
  const plain = "AguaDeCoco";
  const password_hash = await bcrypt.hash(plain, 10);

  await db.execute(
    "INSERT INTO admin_users (username, password_hash) VALUES (?, ?)",
    [username, password_hash]
  );

  console.log("✅ Admin creado:", username);
  console.log("🔑 Password:", plain);
  process.exit(0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
